import os
import json
from io import BytesIO
import tempfile
import unittest
from datetime import date, datetime, timedelta
from uuid import uuid4
from unittest.mock import patch
from sqlalchemy import create_engine, inspect, select, text, update
from fastapi import HTTPException


_database_file = tempfile.NamedTemporaryFile(prefix="eventhub-profile-test-", suffix=".db", delete=False)
_database_file.close()
os.environ["EVENTHUB_DATABASE_PATH"] = _database_file.name

import database
import main
import models
import schemas
import security
from pydantic import ValidationError


class ProfileFeatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        models.Base.metadata.create_all(bind=database.engine)

    def setUp(self):
        self.db = database.SessionLocal()
        for table in (
            models.registrations,
            models.favorites,
            models.event_staff,
            models.organizer_follows,
            models.follow_requests,
            models.user_blocks,
            models.user_mutes,
        ):
            self.db.execute(table.delete())
        self.db.query(models.Event).delete(synchronize_session=False)
        self.db.query(models.User).delete(synchronize_session=False)
        self.db.commit()
        self.user = models.User(
            name="Profile Owner",
            email="owner@example.com",
            username="profile-owner",
            hashed_password="unused",
            is_public=1,
            show_attended_events=1,
            show_attendance_count=0,
        )
        self.viewer = models.User(
            name="Profile Viewer",
            email="viewer@example.com",
            username="profile-viewer",
            hashed_password="unused",
            avatar_url="https://example.com/avatar.png",
        )
        self.event = models.Event(
            title="Past Meetup",
            description="A past event",
            date="2020-01-01",
            time="18:00",
            location="Hall, City, Country",
            category="Music",
            max_participants=20,
        )
        self.db.add_all([self.user, self.viewer, self.event])
        self.db.commit()
        self.db.execute(models.registrations.insert().values(
            user_id=self.user.id,
            event_id=self.event.id,
            ticket_code="a" * 32,
            checked_in_at=datetime(2020, 1, 1, 18, 0),
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_attendance_count_privacy_is_independent_of_past_events(self):
        profile = main.public_user_profile(self.user, self.db, self.viewer)

        self.assertNotIn("attended_events_count", profile)
        self.assertEqual([event["id"] for event in profile["attended_events"]], [self.event.id])
        self.assertNotIn("vip-attendee", [badge["id"] for badge in profile["badges"]])

    def test_hiding_past_events_does_not_hide_attendance_count(self):
        self.user.show_attended_events = 0
        self.user.show_attendance_count = 1
        self.db.commit()

        profile = main.public_user_profile(self.user, self.db, self.viewer)

        self.assertEqual(profile["attended_events_count"], 1)
        self.assertNotIn("attended_events", profile)

    def test_private_profile_hides_activity_from_non_followers(self):
        self.user.is_public = 0
        self.db.commit()

        profile = main.public_user_profile(self.user, self.db, self.viewer)

        self.assertEqual(profile["bio"], "")
        self.assertEqual(profile["preferred_categories"], [])
        self.assertIsNone(profile["follower_count"])
        self.assertNotIn("attended_events_count", profile)
        self.assertNotIn("attended_events", profile)

    def test_favorite_event_can_be_featured(self):
        self.db.execute(models.favorites.insert().values(user_id=self.user.id, event_id=self.event.id))
        self.db.commit()

        main.update_me(schemas.UserUpdate(featured_event_id=self.event.id), self.user, self.db)

        self.db.refresh(self.user)
        self.assertEqual(self.user.featured_event_id, self.event.id)

    def test_public_location_is_optional(self):
        main.update_me(schemas.UserUpdate(profile_location=None), self.user, self.db)

        self.db.refresh(self.user)
        self.assertIsNone(self.user.profile_location)

    def test_existing_database_migrates_new_profile_privacy_fields(self):
        legacy_file = tempfile.NamedTemporaryFile(prefix="eventhub-legacy-profile-test-", suffix=".db", delete=False)
        legacy_file.close()
        legacy_engine = create_engine(f"sqlite:///{legacy_file.name}")
        original_engine = database.engine
        try:
            with legacy_engine.begin() as connection:
                connection.execute(text(
                    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, "
                    "hashed_password TEXT, city TEXT, country TEXT)"
                ))
                connection.execute(text(
                    "CREATE TABLE events (id INTEGER PRIMARY KEY, organizer_id INTEGER)"
                ))
                connection.execute(text(
                    "CREATE TABLE registrations (user_id INTEGER, event_id INTEGER, PRIMARY KEY (user_id, event_id))"
                ))
                connection.execute(text(
                    "INSERT INTO users (id, name, email, hashed_password, city, country) "
                    "VALUES (1, 'Legacy Member', 'legacy@example.com', 'unused', 'Lisbon', 'Portugal')"
                ))

            database.engine = legacy_engine
            database.ensure_user_contact_columns()

            inspector = inspect(legacy_engine)
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            registration_columns = {column["name"] for column in inspector.get_columns("registrations")}
            self.assertIn("show_attendance_count", user_columns)
            self.assertIn("profile_location", user_columns)
            with legacy_engine.connect() as connection:
                location = connection.execute(text(
                    "SELECT profile_location FROM users WHERE id = 1"
                )).scalar_one()
            self.assertEqual(location, "Lisbon, Portugal")
            self.assertIn("ticket_code", registration_columns)
        finally:
            database.engine = original_engine
            legacy_engine.dispose()
            os.unlink(legacy_file.name)

    def test_network_lists_include_profile_context_and_allow_follower_removal(self):
        self.db.execute(models.organizer_follows.insert().values(
            follower_id=self.viewer.id,
            organizer_id=self.user.id,
        ))
        self.db.commit()

        network = main.get_user_network(self.user.id, "followers", self.user, self.db)

        self.assertEqual(network[0]["role"], "attendee")
        self.assertEqual(network[0]["avatar_url"], "https://example.com/avatar.png")
        self.assertFalse(network[0]["following"])
        self.assertEqual(main.remove_follower(self.viewer.id, self.user, self.db), {"removed": True})

    def test_block_removes_both_follow_directions(self):
        self.db.execute(models.organizer_follows.insert().values(
            follower_id=self.viewer.id,
            organizer_id=self.user.id,
        ))
        self.db.execute(models.organizer_follows.insert().values(
            follower_id=self.user.id,
            organizer_id=self.viewer.id,
        ))
        self.db.commit()

        main.block_user(self.user.id, self.viewer, self.db)

        self.assertTrue(main.is_blocked_between(self.db, self.viewer.id, self.user.id))
        self.assertEqual(self.db.query(models.organizer_follows).count(), 0)

    def test_event_highlight_shows_followed_private_attendees(self):
        self.user.is_public = 0
        self.db.execute(models.organizer_follows.insert().values(
            follower_id=self.viewer.id,
            organizer_id=self.user.id,
        ))
        self.db.commit()

        attendees = main.get_mutual_event_attendees(self.event.id, self.viewer, self.db)

        self.assertEqual([person["id"] for person in attendees], [self.user.id])

    def test_bio_limit_and_interest_limit_are_validated(self):
        with self.assertRaises(ValidationError):
            schemas.UserUpdate(bio="x" * 501)
        with self.assertRaises(ValidationError):
            schemas.UserUpdate(preferred_categories=["Unsupported"])
        preferences = schemas.UserUpdate(preferred_categories=[
            "Music", "Sports", "Gaming", "Technology", "Education", "Art",
            "Business", "Entertainment", "Music",
        ])
        self.assertEqual(len(preferences.preferred_categories), 8)

    def test_registration_is_rejected_for_cancelled_event(self):
        self.event.status = "cancelled"
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            main.register_for_event(self.event.id, self.viewer, self.db)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(error.exception.detail, "Não é possível inscrever-se num evento cancelado.")
        self.assertNotIn(self.viewer, self.event.participants)

    def test_event_creation_validates_city_from_location(self):
        self.user.role = "organizer"
        self.db.commit()
        event_data = schemas.EventCreate(
            title="Valid location",
            description="An event with a valid city in its location.",
            date=(date.today() + timedelta(days=1)).isoformat(),
            time="18:00",
            location="Rua de Teste, Porto, Portugal",
            category="Music",
            max_participants=20,
        )

        with patch("main.require_existing_city") as validate_city:
            event = main.create_event(event_data, self.user, self.db)

        validate_city.assert_called_once_with("Porto")
        self.assertEqual(event.location, "Rua de Teste, Porto, Portugal")

    def test_event_creation_and_update_reject_nonexistent_city(self):
        self.user.role = "organizer"
        self.event.organizer_id = self.user.id
        self.db.commit()
        event_data = schemas.EventCreate(
            title="Invalid location",
            description="An event with a city that does not exist.",
            date=(date.today() + timedelta(days=1)).isoformat(),
            time="18:00",
            location="Rua de Teste, Cidade Inventada, Portugal",
            category="Music",
            max_participants=20,
        )

        with patch(
            "main.require_existing_city",
            side_effect=HTTPException(status_code=422, detail="Selecione uma cidade válida nas sugestões."),
        ) as validate_city:
            with self.assertRaises(HTTPException) as create_error:
                main.create_event(event_data, self.user, self.db)

        self.assertEqual(create_error.exception.status_code, 422)
        validate_city.assert_called_once_with("Cidade Inventada")
        self.assertEqual(self.db.query(models.Event).count(), 1)

        with patch(
            "main.require_existing_city",
            side_effect=HTTPException(status_code=422, detail="Selecione uma cidade válida nas sugestões."),
        ) as validate_city:
            with self.assertRaises(HTTPException) as update_error:
                main.update_event(self.event.id, event_data, self.user, self.db)

        self.assertEqual(update_error.exception.status_code, 422)
        validate_city.assert_called_once_with("Cidade Inventada")
        self.db.refresh(self.event)
        self.assertEqual(self.event.location, "Hall, City, Country")

    def test_ticket_payload_accepts_ticket_url_and_raw_code(self):
        ticket_code = uuid4().hex
        self.assertEqual(main.ticket_code_from_payload(ticket_code), ticket_code)
        self.assertEqual(
            main.ticket_code_from_payload(f"https://events.example.com/ticket.html?code={ticket_code}"),
            ticket_code,
        )
        with self.assertRaises(HTTPException) as error:
            main.ticket_code_from_payload("not-a-ticket")
        self.assertEqual(error.exception.status_code, 404)

    def test_public_ticket_status_tracks_cancellation_and_check_in(self):
        self.db.execute(
            update(models.registrations)
            .where(models.registrations.c.ticket_code == "a" * 32)
            .values(checked_in_at=None)
        )
        self.db.commit()
        ticket = main.get_public_ticket("a" * 32, self.db)
        self.assertEqual(ticket["status"], "valid")
        self.assertEqual(ticket["attendee_name"], self.user.name)

        self.db.execute(
            update(models.registrations)
            .where(models.registrations.c.ticket_code == "a" * 32)
            .values(checked_in_at=datetime.utcnow())
        )
        self.db.commit()
        self.assertEqual(main.get_public_ticket("a" * 32, self.db)["status"], "checked_in")

        self.event.status = "cancelled"
        self.db.commit()
        self.assertEqual(main.get_public_ticket("a" * 32, self.db)["status"], "cancelled")

    def test_staff_ticket_verification_checks_in_once(self):
        self.viewer.role = "staff"
        self.event.organizer_id = self.user.id
        self.db.flush()
        self.db.execute(models.event_staff.insert().values(
            event_id=self.event.id,
            staff_id=self.viewer.id,
            status="approved",
            requested_at=datetime.utcnow(),
        ))
        ticket_code = uuid4().hex
        self.db.execute(models.registrations.insert().values(
            user_id=self.viewer.id,
            event_id=self.event.id,
            ticket_code=ticket_code,
        ))
        self.db.commit()
        verification = schemas.TicketVerificationRequest(
            event_id=self.event.id,
            ticket_payload=f"https://events.example.com/ticket.html?code={ticket_code}",
        )

        result = main.verify_ticket_entry(verification, self.viewer, self.db)
        self.assertEqual(result["status"], "checked_in")
        self.assertEqual(result["attendee_name"], self.viewer.name)
        registration = self.db.execute(
            select(models.registrations).where(
                models.registrations.c.ticket_code == ticket_code
            )
        ).mappings().one()
        self.assertIsNotNone(registration["checked_in_at"])
        self.assertEqual(registration["checked_in_by"], self.viewer.id)

        with self.assertRaises(HTTPException) as error:
            main.verify_ticket_entry(verification, self.viewer, self.db)
        self.assertEqual(error.exception.status_code, 409)

    def test_ticket_verification_rejects_wrong_event_and_unapproved_staff(self):
        self.viewer.role = "staff"
        self.event.organizer_id = self.user.id
        self.db.flush()
        ticket_code = uuid4().hex
        self.db.execute(models.registrations.insert().values(
            user_id=self.viewer.id,
            event_id=self.event.id,
            ticket_code=ticket_code,
        ))
        self.db.execute(models.event_staff.insert().values(
            event_id=self.event.id,
            staff_id=self.viewer.id,
            status="pending",
            requested_at=datetime.utcnow(),
        ))
        self.db.commit()

        unauthorized = schemas.TicketVerificationRequest(
            event_id=self.event.id,
            ticket_payload=ticket_code,
        )
        with self.assertRaises(HTTPException) as error:
            main.verify_ticket_entry(unauthorized, self.viewer, self.db)
        self.assertEqual(error.exception.status_code, 403)

        self.db.execute(models.event_staff.update().where(
            models.event_staff.c.event_id == self.event.id,
            models.event_staff.c.staff_id == self.viewer.id,
        ).values(status="approved"))

        other_event = models.Event(
            title="Another event",
            description="A different test event",
            date="2026-12-01",
            time="18:00",
            location="Hall, City, Country",
            category="Music",
            max_participants=20,
            organizer_id=self.user.id,
        )
        self.db.add(other_event)
        self.db.commit()
        self.db.execute(models.event_staff.insert().values(
            event_id=other_event.id,
            staff_id=self.viewer.id,
            status="approved",
            requested_at=datetime.utcnow(),
        ))
        self.db.commit()

        wrong_event = schemas.TicketVerificationRequest(
            event_id=other_event.id,
            ticket_payload=ticket_code,
        )
        with self.assertRaises(HTTPException) as error:
            main.verify_ticket_entry(wrong_event, self.viewer, self.db)
        self.assertEqual(error.exception.status_code, 400)

    def test_ticket_verification_rejects_cancelled_event(self):
        self.viewer.role = "staff"
        self.event.status = "cancelled"
        self.event.organizer_id = self.user.id
        self.db.flush()
        self.db.execute(models.event_staff.insert().values(
            event_id=self.event.id,
            staff_id=self.viewer.id,
            status="approved",
            requested_at=datetime.utcnow(),
        ))
        ticket_code = uuid4().hex
        self.db.execute(models.registrations.insert().values(
            user_id=self.viewer.id,
            event_id=self.event.id,
            ticket_code=ticket_code,
        ))
        self.db.commit()

        with self.assertRaises(HTTPException) as error:
            main.verify_ticket_entry(
                schemas.TicketVerificationRequest(
                    event_id=self.event.id,
                    ticket_payload=ticket_code,
                ),
                self.viewer,
                self.db,
            )
        self.assertEqual(error.exception.status_code, 400)
        registration = self.db.execute(
            select(models.registrations).where(
                models.registrations.c.ticket_code == ticket_code
            )
        ).mappings().one()
        self.assertIsNone(registration["checked_in_at"])

    def test_development_jwt_secret_default_remains_available(self):
        with patch.dict(os.environ, {"EVENTHUB_ENV": "development"}, clear=True):
            self.assertEqual(security.load_secret_key(), security.DEVELOPMENT_SECRET_KEY)

    def test_production_rejects_missing_or_placeholder_jwt_secret(self):
        for secret_key in (None, "", "  ", security.DEVELOPMENT_SECRET_KEY, "change-me-in-production"):
            environment = {"EVENTHUB_ENV": "production"}
            if secret_key is not None:
                environment["EVENTHUB_SECRET_KEY"] = secret_key
            with self.subTest(secret_key=secret_key), patch.dict(os.environ, environment, clear=True):
                with self.assertRaisesRegex(RuntimeError, "production"):
                    security.load_secret_key()

    def test_production_accepts_configured_jwt_secret(self):
        with patch.dict(os.environ, {
            "EVENTHUB_ENV": "production",
            "EVENTHUB_SECRET_KEY": "a-configured-production-secret",
        }, clear=True):
            self.assertEqual(security.load_secret_key(), "a-configured-production-secret")

    def test_production_requires_explicit_cors_origins(self):
        with patch.dict(os.environ, {"EVENTHUB_ENV": "production"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "CORS_ALLOWED_ORIGINS"):
                main.load_cors_allowed_origins()

    def test_cors_origins_are_trimmed_and_local_defaults_remain_available(self):
        with patch.dict(os.environ, {
            "EVENTHUB_ENV": "production",
            "CORS_ALLOWED_ORIGINS": " https://events.example.com/ , https://admin.example.com ",
        }, clear=True):
            self.assertEqual(
                main.load_cors_allowed_origins(),
                ["https://events.example.com", "https://admin.example.com"],
            )

        with patch.dict(os.environ, {"EVENTHUB_ENV": "development"}, clear=True):
            self.assertIn("http://localhost:5500", main.load_cors_allowed_origins())

    def test_city_search_returns_populated_places_with_region_context(self):
        response = {
            "results": [
                {"name": "Porto", "country": "Portugal", "admin1": "Porto", "feature_code": "PPLA"},
                {"name": "Porto District", "country": "Portugal", "feature_code": "ADM2"},
                {"name": "Porto", "country": "Portugal", "admin1": "Porto", "feature_code": "PPLA"},
            ]
        }
        with patch("main.urlopen", return_value=BytesIO(json.dumps(response).encode("utf-8"))):
            cities = main.search_cities("Porto")

        self.assertEqual(cities, [{"name": "Porto", "country": "Portugal", "region": "Porto"}])

    def test_city_search_rejects_whitespace_only_queries(self):
        with self.assertRaises(HTTPException) as error:
            main.search_cities("  ")
        self.assertEqual(error.exception.status_code, 422)

    def test_city_validation_requires_an_existing_place_and_fails_closed(self):
        response = {"results": [
            {"name": "São Paulo", "country": "Brasil", "feature_code": "PPLA"},
        ]}
        with patch("main.urlopen", side_effect=[
            BytesIO(json.dumps(response).encode("utf-8")),
            BytesIO(json.dumps({"results": []}).encode("utf-8")),
        ]):
            main.require_existing_city("Sao Paulo")
            with self.assertRaises(HTTPException) as error:
                main.require_existing_city("Cidade inventada")
        self.assertEqual(error.exception.status_code, 422)

        with patch("main.urlopen", side_effect=OSError("geocoding unavailable")):
            with self.assertRaises(HTTPException) as error:
                main.require_existing_city("Porto")
        self.assertEqual(error.exception.status_code, 503)

    def test_city_search_reports_provider_errors_as_unavailable(self):
        with patch("main.urlopen", return_value=BytesIO(b'{"error": true, "reason": "rate limit"}')):
            with self.assertRaises(HTTPException) as error:
                main.search_cities("Porto")
        self.assertEqual(error.exception.status_code, 503)

        with patch("main.urlopen", return_value=BytesIO(b'{"results": "invalid"}')):
            with self.assertRaises(HTTPException) as error:
                main.search_cities("Porto")
        self.assertEqual(error.exception.status_code, 503)

    def test_signup_and_profile_updates_enforce_city_validation(self):
        signup = schemas.UserCreate(
            name="City User",
            email="city@example.com",
            password="password",
            phone_number="+351912345678",
            country="Portugal",
            city="Porto",
        )
        with patch("main.require_existing_city", side_effect=HTTPException(status_code=422, detail="invalid city")) as validate_city:
            with self.assertRaises(HTTPException):
                main.register(signup, self.db)
            validate_city.assert_called_once_with("Porto")

        update = schemas.UserUpdate(city="Porto")
        with patch("main.require_existing_city", side_effect=HTTPException(status_code=422, detail="invalid city")) as validate_city:
            with self.assertRaises(HTTPException):
                main.update_me(update, self.user, self.db)
            validate_city.assert_called_once_with("Porto")

    def test_city_input_schema_limits_name_length(self):
        with self.assertRaises(ValidationError):
            schemas.UserCreate(
                name="City User",
                email="longcity@example.com",
                password="password",
                phone_number="+351912345678",
                country="Portugal",
                city="x" * 81,
            )
        with self.assertRaises(ValidationError):
            schemas.UserUpdate(city="x" * 81)


def tearDownModule():
    database.engine.dispose()
    try:
        os.unlink(_database_file.name)
    except FileNotFoundError:
        pass
    os.environ.pop("EVENTHUB_DATABASE_PATH", None)


if __name__ == "__main__":
    unittest.main()

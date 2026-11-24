"""Versioned evidence checklists. Bump CHECKLIST_VERSION when any item changes."""

from dataclasses import dataclass

CHECKLIST_VERSION = "2026-11.v1"


@dataclass(frozen=True, slots=True)
class ChecklistItem:
    key: str
    label: str
    required: bool = True


CHECKLISTS: dict[str, tuple[ChecklistItem, ...]] = {
    "Roster / booking not syncing": (
        ChecklistItem("affected_employee_ids", "Affected employee IDs listed"),
        ChecklistItem("shift_date_time", "Shift date and time captured"),
        ChecklistItem("source_vs_app_compared", "Source roster compared with the app"),
        ChecklistItem("last_sync_time", "Last successful sync time noted", required=False),
    ),
    "Live tracking / GPS incorrect": (
        ChecklistItem("trip_or_vehicle_id", "Trip or vehicle ID captured"),
        ChecklistItem("incident_time", "Time of incorrect location captured"),
        ChecklistItem("driver_app_gps_checked", "Driver app and GPS permission checked"),
        ChecklistItem("screenshot_attached", "Screenshot or route trace attached", required=False),
    ),
    "Report export failing": (
        ChecklistItem("report_name_filters", "Report name and filters captured"),
        ChecklistItem("date_range", "Date range captured"),
        ChecklistItem("known_issues_checked", "Known-issue list checked"),
        ChecklistItem("error_attached", "Error message or screenshot attached", required=False),
    ),
    "Cab delay / no-show complaint": (
        ChecklistItem("trip_id", "Trip ID captured"),
        ChecklistItem("scheduled_vs_actual", "Scheduled and actual times compared"),
        ChecklistItem("vendor_contacted", "Vendor or driver contacted"),
    ),
    "How-to / feature request": (
        ChecklistItem("help_article_checked", "Help article or runbook checked"),
        ChecklistItem("user_goal", "User goal written down"),
        ChecklistItem("role_permissions_checked", "User role and permissions checked"),
    ),
    "Login / access issue": (
        ChecklistItem("user_identifier", "Affected user identifier captured"),
        ChecklistItem("account_status_checked", "Account status and role checked"),
        ChecklistItem("reset_attempted", "Password or session reset attempted"),
        ChecklistItem("error_attached", "Error message attached", required=False),
    ),
    "OTP / boarding issue": (
        ChecklistItem("trip_id", "Trip ID captured"),
        ChecklistItem("employee_contact_verified", "Employee contact details verified"),
        ChecklistItem("otp_retry_attempted", "OTP resend or retry attempted"),
    ),
    "Billing / invoice discrepancy": (
        ChecklistItem("invoice_number", "Invoice number captured"),
        ChecklistItem("billing_period", "Billing period captured"),
        ChecklistItem("expected_vs_billed", "Expected and billed amounts compared"),
        ChecklistItem("contract_rate_checked", "Contract rate checked", required=False),
    ),
    "Employee address / geocode change": (
        ChecklistItem("employee_id", "Employee ID captured"),
        ChecklistItem("old_new_address", "Old and new address captured"),
        ChecklistItem("geocode_verified", "Pin location verified on the map"),
    ),
    "Driver / vehicle compliance docs": (
        ChecklistItem("driver_or_vehicle_id", "Driver or vehicle ID captured"),
        ChecklistItem("document_type_expiry", "Document type and expiry captured"),
        ChecklistItem("document_attached", "Current document attached"),
    ),
}

KYRGYZ_COUNTRY_CODE = "996"


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def normalize_phone(phone: str) -> str:
    """Return phone in E.164-like form (e.g. +996223550868).

    For local Kyrgyz numbers starting with 0, removes the trunk prefix and
    prepends the country code. Keeps other international numbers as-is when they
    already include a leading + or 00 and a different country code.
    """
    if phone is None:
        return ""
    raw = str(phone).strip()
    if not raw:
        return ""

    digits = _digits_only(raw)
    if not digits:
        return ""

    # If the number already contains an explicit country code different from
    # Kyrgyzstan, respect it and simply return +<digits>.
    if raw.startswith("+") or raw.startswith("00"):
        if not digits.startswith(KYRGYZ_COUNTRY_CODE):
            return f"+{digits}"

    # Strip leading international/trunk prefixes (00, +, or 0)
    if raw.startswith("00"):
        digits = digits[2:]
    digits = digits.lstrip("0")

    if not digits:
        return ""

    if not digits.startswith(KYRGYZ_COUNTRY_CODE):
        # Keep only the last 9 digits for local numbers to avoid accidental
        # overflow when users paste numbers with spaces or mixed separators.
        if len(digits) > 9:
            digits = digits[-9:]
        digits = KYRGYZ_COUNTRY_CODE + digits

    return f"+{digits}"


def format_phone_display(phone: str) -> str:
    """Return a human friendly representation (+996 223550868)."""
    normalized = normalize_phone(phone)
    if not normalized:
        return ""
    digits = _digits_only(normalized)
    if len(digits) <= 3:
        return normalized
    return f"+{digits[:3]} {digits[3:]}"

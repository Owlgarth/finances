# Data Formatting

> Rules for displaying numbers, currency, percentages, and dates.
> Consistent formatting is critical in a finance application — inconsistency erodes trust.

---

## Currency & Numbers

| Format | Rule | Example | Font |
|---|---|---|---|
| Thousands separator | Comma (`,`) by default — configurable via `UserPreferences` in future | `1,234,567` | JetBrains Mono |
| Decimal places | Always exactly **2** for currency values | `100.00` | JetBrains Mono |
| Negative amount | Minus prefix, `negative` color (#e11d48) | `-1,234.56 PLN` | JetBrains Mono |
| Positive income | Plus prefix, `positive` color (#10b981) | `+1,500.00 PLN` | JetBrains Mono |
| Neutral amount | No prefix, `on-surface` color | `1,234.56 PLN` | JetBrains Mono |
| Currency symbol position | **After** the number, space-separated | `1,234.56 PLN` | JetBrains Mono |
| Zero amount | Show as `0.00`, `on-surface-variant` color | `0.00 PLN` | JetBrains Mono |

---

## Percentages

| Context | Rule | Example |
|---|---|---|
| Integer | No decimal places | `78%` |
| Fractional | One decimal place | `35.5%` |
| Budget progress | No decimal; cap display at `>999%` for extreme overages | `125%`, `>999%` |

---

## Dates

| Context | Format | Example | Font |
|---|---|---|---|
| Table cells | ISO `YYYY-MM-DD` | `2026-02-16` | JetBrains Mono |
| Page header breadcrumb | Short month + full year | `Feb 2026` | JetBrains Mono |
| Context selector (period) | Short month + full year | `Feb 2026` | JetBrains Mono |
| Timestamp (last calculated) | Date + time, 12h | `3/23/2026, 11:14 AM` | JetBrains Mono |

---

## Rules

- **Never** format negative amounts with parentheses — `(100.00)` is forbidden; use `-100.00`
- **Never** place the currency symbol before the number — `PLN 100.00` is wrong; use `100.00 PLN`
- Thousands separator default is comma (`,`); will be configurable via `UserPreferences.number_format` in a future epic
- Right-align all amount columns in tables so decimal points visually align
- Amounts in inline text (toasts, descriptions) follow the same rules: `150.00 PLN`, not `PLN150`
- All numbers, amounts, dates, and percentages must use **JetBrains Mono** — never Geist

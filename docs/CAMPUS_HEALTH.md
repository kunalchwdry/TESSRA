# Campus Operational Health

The Admin Overview contains a live, deterministic health dashboard calculated from the current relational workspace. It does not use an LLM, predicted values, or hidden inputs.

## Overall calculation

Each available indicator produces a score from 0 to 100. The overall score is:

```text
sum(indicator score × indicator weight) ÷ sum(available indicator weights)
```

If a source has no data, that indicator is displayed as **Not scored** and its weight is removed from both the numerator and denominator. Missing data is never converted to zero.

| Indicator | Weight | Live source | Calculation |
|---|---:|---|---|
| Academic progress | 20% | Completed and total syllabus units | completed units ÷ total recorded units × 100 |
| Faculty availability | 15% | Faculty availability blocks and the 9-period teaching day | unblocked faculty-periods ÷ all faculty-periods × 100 |
| Room utilisation | 15% | Published timetable and active lecture/lab/seminar rooms | 100 points in the 40–85% utilisation band; linear reduction outside it |
| Pending requests | 15% | Pending bookings, schedule changes, disruptions and access requests | 100 − 8 points per outstanding decision, floor 0 |
| Event activity | 10% | Approved operational bookings in the next 30 days | approved events ÷ transparent target of 4 × 100, cap 100 |
| Scheduling efficiency | 25% | Published-version placement statistics and hard validation issues | 75% placement completion + 25% conflict-free score |

Room utilisation uses the actual workspace calendar denominator: 5 teaching days × 9 periods = 45 weekly periods per active teaching room.

## Status bands

| Score | State |
|---:|---|
| 85–100 | Healthy |
| 70–84 | Stable |
| 50–69 | Watch |
| 0–49 | Needs attention |
| no source rows | Not scored |

## Transparency in the UI

Each compact indicator tile shows its current 0–100 score, configured weight, raw operational value and a direct link to the relevant Admin workflow. To keep the overview minimal, exact formulas and database/workflow sources sit inside the collapsed **How scoring works** section.

The dashboard also displays the calculation timestamp, number of scored indicators, and whether any configured weight was excluded for missing data.

## Safety and data behaviour

- The dashboard is read-only and adds no mutation path.
- It uses existing tables and requires no database migration.
- Access remains protected by the existing Admin role guard.
- No production data is copied to an external analytics or AI service.
- Scores are recomputed on each dynamic Admin Overview request from current data.

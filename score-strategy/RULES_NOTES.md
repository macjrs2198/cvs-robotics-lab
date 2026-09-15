# CVS Score & Strategy — practice notes

CVS Score & Strategy is a **practice arithmetic tool, not an official competition score or ruling**. The supplied point basis is *2026 BEST Robotics Classic Competition Rules — Byte to Bite*, v3.3, September 10, 2026, sections 3.7.1–3.7.3 and Table 3.7 (pp.34–38). Credit for the game rules belongs to BEST Robotics. No later Q&A or revision has been incorporated.

## Practice Score

- Enter each counted outcome at one final location. The tally updates immediately, including when a counter is blank, pasted, or changed with +/−. A blank or malformed numeric entry contributes zero without erasing other points. This is a user-entered practice count, not physical-outcome verification.
- Salad, Pizza, and Sandwich are 10, 30, and 50 base points in field-side locations, and 5, 15, and 25 in QCA. A drink attached to a meal adds 12 field-side points (6 in QCA); a standalone drink adds 4 field-side points (2 in QCA). An attached drink is not also entered as a standalone drink.
- Warming Shelf adds 5, Balance Buffet adds 15, and Autonomous Dining Room adds 50 per counted unit. For Shelf and Buffet, the location bonus is counted once for a meal, standalone drink, or meal-plus-drink pair; the attached drink adds drink points but no second location award. Buffet entries tally when entered, without a qualification switch.
- The six one-time Garden objectives add Drone 8, Irrigation 4, Vegetables 4, Fruit 4, Cold Ingredients 8, and Grain 8.
- Practice Score is always the arithmetic tally of the entered counts and Garden checks. It does not enforce plate/cup limits, Shelf/Buffet capacities, attached-drink subset timing, or official judging conditions. It does not zero the tally for a legacy DQ flag. The three-minute timer is independent and never locks editing or saving.

## Optimizer assumptions

The optional optimizer compares integer combinations of **complete, sequential, user-timed task cycles** under the declared time, resources, and repeat limits. It shares the Practice Score formula. It does not plan routes, control robots, predict opponents, model parallel spotter work, or guarantee a competition maximum. QCA profiles must include spotter work in their measured cycle time; paired-drink timing must include water access. Enabled tasks need usable recipes and measured timings.

One designated area's default ingredient budget—six each of fruit, vegetables, dairy, and protein; twelve grain; eight water—is a **conservative planning assumption**, not team ownership. The optional two-area shared-half amounts are shared with another team and not guaranteed. Eight plates/cups and available Dining tables are planning budgets, not caps on manual Practice Score entry. Buffet is limited by the optimizer's declared resources, time, and repeats, not a manual qualification toggle.

The separate **Custom Practice** mode uses user-named objective point values. Its configured maximum is an optimizer planning limit, not a cap on the manual practice counter. It does not relabel custom points as sourced Byte to Bite values.

## Local history and imports

New saves record the visible Practice Score, count breakdown, ruleset version, and optional PLANNED label. Browser-local history remains as recorded; loading a historical round recomputes the active Practice Score from its counts. Older exported records with DQ or qualification fields are accepted through a small compatibility adapter without rewriting the stored history. Invalid imports are rejected transactionally, and CSV text cells are protected against spreadsheet formula interpretation. Export JSON for a portable backup.

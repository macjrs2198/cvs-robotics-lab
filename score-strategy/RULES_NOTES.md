# CVS Score & Strategy — rules and modeling notes

This is a **practice translation, not official referee software or a BEST Robotics ruling**. The supplied source basis is *2026 BEST Robotics Classic Competition Rules — Byte to Bite*, v3.3, September 10, 2026. The supplied *Scoring Summary* is an extract of the full rules' printed pages 34–38. Relevant full-document sections are 1.4.4–1.4.5 (p.16), 3.3–3.7 (pp.24–38), Table 3.7 (pp.37–38), and Appendices D/E (pp.64–68). Credit for the game rules belongs to BEST Robotics. No later Q&A or revision has been incorporated. The original PDFs are retained locally, not copied into the public app.

## Source-derived practice scoring

- Score the eligible **final state**, not a sequence of actions. Each valid completed meal or drink belongs to one final location and receives no cumulative award for passing through multiple locations (3.6.1.D; 3.7, pp.32–38).
- Base meal points for field-side locations are Salad 10, Pizza 30, Sandwich 50; QCA replaces these with 5, 15, 25. A drink attached to a field-side meal adds 12 (QCA 6), while a standalone field-side drink scores 4 (QCA 2). The attached drink is a subset of meals and is not counted again as standalone (3.7.1–3.7.2; Table 3.7, pp.34–38).
- A qualifying Warming Shelf outcome gains 5 location points; a qualifying Balance Buffet outcome gains 15; a valid Autonomous Dining Room plated meal gains 50. The shelf/buffet drink-and-combination notes are translated to award the location bonus **once per eligible meal, standalone drink, or meal-plus-drink pair**. This is an explicit interpretation of those notes, not a new cup-packing rule or an official ruling (3.7.2; Table 3.7, pp.34–38).
- Eight team-owned plates and eight cups are shared caps across all final locations. Shelf and Buffet scored-unit maxima are seven and three respectively. Dining tables are shared, one scored meal per distinct table, with team plate supply limiting a team's count to eight; standalone drinks are not entered for Dining (3.3.2.2–3.3.2.5; 3.7.2; Table 3.7, pp.28–38).
- The six one-time designated Garden objectives are Drone 8, Irrigation 4, Vegetables 4, Fruit 4, Cold Ingredients 8, Grain 8. Their owning team may receive credit even if another robot completed the designated objective; they are not per-ingredient counters (3.7.3.D; Table 3.7, pp.35–38).
- A match lasts three minutes. A 20-second suspension is lost operating time, not a points subtraction. DQ sets awarded match points to zero while this practice tool retains the raw subtotal for analysis (1.4.4–1.4.5, p.16).

The human scorer determines meal ingredients and placement validity, table availability, Buffet correct-side/balance/pivot support, QCA boundary, and any referee-recognized exception. Counts alone cannot prove these physical conditions. Unconfirmed Buffet entries remain **needing review**; the app does not silently erase, reclassify, or award them. A remote-controlled or occupied-table Dining placement is also a judging issue, not an automatic field-score fallback. The calculator never claims a verified result from invalid counts.

## Optimizer assumptions, not game rules

The optimizer compares integer combinations of **complete, sequential, user-timed task cycles**. It does not plan routes, control robots, predict opponents, model parallel spotter work, or guarantee a competition maximum. QCA profiles must include spotter work in their measured cycle time; paired-drink timing must include water access. Only completed valid recipes and user-enabled activities can be considered.

One designated area's default ingredient budget—six each of fruit, vegetables, dairy, and protein; twelve grain; eight water—is a **conservative planning assumption**, not team ownership. The optional two-area shared-half amounts (12 each of those four non-grain types, 24 grain, 16 water) are shared with the other team and are not guaranteed. The team-owned eight plates/eight cups cap does **not** double under the shared-half option (3.3.2.1, p.25; 3.3.2.5, p.31; Appendix E, pp.65–68). The default eight available Dining tables is an optimistic user budget, not a promised vacancy. Buffet plans remain conditional on a human-supplied qualification assumption.

Example minimal planning recipes are fruit + vegetable for Salad, grain + vegetable + dairy + protein for Pizza, and two grain plus all four non-grain ingredients for Sandwich. These are **eligible examples**, not fixed official recipes or invented team timing benchmarks. Users must verify recipe choice and remeasure complete cycles when changing it. Garden additional-task times must be non-overlapping; included objectives score once only.

The separate **Custom Practice** mode uses only user-named objectives with integer points per completion and finite maximum counts. It does not relabel custom points as sourced Byte to Bite values or reinterpret historical rounds.

## Storage and validation

Round exports preserve raw inputs, result arithmetic, date, and ruleset version. History is browser-local and must be exported for a portable backup; the app does not silently recompute saved historical totals after a rules update. Invalid imported data remains unverified or is rejected transactionally. CSV user-text cells are escaped against spreadsheet formula interpretation.

The handoff mentioned score/optimizer acceptance fixture JSON files, but those files were not present in the supplied workspace at implementation preflight. Tests must therefore be described by the cases actually implemented and run, not by a claim that missing fixture files were consumed.

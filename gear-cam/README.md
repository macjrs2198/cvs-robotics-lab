# CVS Gear Cutter

This static app adds gear drawing and simple 2D router profile cutting to the CVS Robotics Lab. It accepts the six inputs from `GearBuilder_Fixed.xlsm` (or manual entries), rebuilds both outlines without running Excel macros, and exports a closed DXF drawing. It also accepts compatible closed DXF profiles for a GRBL cut job.

DXF export writes an AutoCAD 2018 drawing in millimeters by default, with standard drawing tables and objects, closed 2D `POLYLINE` contours on layer 0, and true `CIRCLE` entities for round holes. To use the drawing as editable geometry in Autodesk Inventor, create a Part, start a 2D Sketch, then choose Sketch → Insert → ACAD and select the exported profiles. The DXF contains the drawing contours, while the separate `.nc` download contains the compensated cutter path. The exporter can also write inches when called with `unit: 'in'`; the app's download uses millimeters.

## Workbook geometry

The source workbook uses pinion and gear tooth counts, pressure angle, center distance in inches, and two dedendum safety factors. `gear.js` reproduces its 40-point-per-tooth outlines and converts them to millimeters internally. The provided 30-tooth saved trace is used as a regression fixture. The original macro's `li` text is a LibreCAD drawing script, not machine G-code.

## Router workflow

1. Load the workbook or enter gear values; select a single gear outline. A centered bore, if requested, becomes its own inside profile. Alternatively, load a DXF of closed profiles.
2. Choose the cut side for each profile and move profiles up or down into the desired cut order. Add holding tabs to outer cutouts, then inspect their positions in the preview.
3. Enter measured stock thickness, bit diameter, either a pass count or depth per pass in millimeters, feed rates, safe Z, spindle RPM, and the chosen work origin. The other pass value updates automatically. Download the `.nc` file and inspect its paths and Z moves in Universal G-code Sender before running an air cut.

The DXF reader accepts flat, closed `LWPOLYLINE`, legacy 2D `POLYLINE`, and `CIRCLE` entities, including polyline bulge arcs, and can join connected `LINE` entities into closed loops. It reads inch or millimeter `$INSUNITS`; unitless drawings require an explicit unit choice. Open paths, splines, text, and other unsupported entities are rejected. A job can contain up to 32 profiles. This first version makes profile cuts only: no pockets, drilling cycles, or separate roughing/finishing passes. Tabs are available on outside cuts.

G-code is in millimeters (`G21`) and uses absolute work coordinates (`G90`, `G54`) with Z0 on the stock top. The app calculates the tool-center path; GRBL does not provide cutter compensation for this job. Machine settings are intentionally required rather than assumed. All cuts plunge at the start of each depth pass, so the bit must be able to plunge in the selected material. A full-depth cut needs a secure hold-down plan for every loose piece. The output cannot verify a real machine's travel, clamps, tool, spindle wiring, or material setup.

Run the scoped tests with `node --test gear-cam/*.test.*` from the repository root. The app itself has no build step and is served with the other static lab tools.

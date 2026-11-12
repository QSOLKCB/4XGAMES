# The VOIDWARD 3D Workbench

[Open the Workbench](../editor/index.html) · [Visual workshop](WORKSHOP.md) · [Text formats](../MOD_GUIDE.md)

The bundled VANILLAJS Workbench lets you place stars in a 3D viewport, build ship
geometry and edit a separate campaign draft. It runs from this repository and
its GitHub Pages package. No account, external editor or runtime download is
required. Serve the repository over HTTP as described in the README.

## From a campaign to the editor and back

1. In the game, open **Campaign workshop → Visual workshop**. Apply any pending
   form edits, then choose **Open in 3D Workbench**. The validated draft travels
   locally to the editor. Your expedition's save stays in its existing slot.
2. Change the campaign ID and title before making a new universe. Choose
   **Apply campaign identity**. All five installed campaigns can be sent to the
   editor this way; **Load frontier template** starts a fresh Open Frontier draft.
3. Use the galaxy, hull or text controls below. Changes affect a detached draft.
   **Undo campaign / Redo campaign** has a separate history from scene Undo/Redo.
4. Choose **Export campaign** to keep a portable backup. **Export Mod SDK** is
   available for packs that fit the SDK's smaller budget.
5. Choose **Send draft to game**. A game tab opens with the draft in the visual
   workshop for review. It restores the existing expedition first; receiving a
   draft does not start a new game or overwrite that expedition.
6. Choose **Launch draft campaign**, select an empire and choose **Launch edited
   universe** when ready. This uses the current expedition's seed/difficulty.
   **New game → Current imported campaign** changes those after launch. A new
   content identity gets its own save slot; deliberately relaunching the same
   content and empire restarts that slot, so export the old save first.

If popups or browser storage are blocked, use **Export campaign** and the game's
**Open portable pack**. Imported packs contain data only. Matching a campaign ID
never activates installed JavaScript hooks. Machine Dawn's installed fabrication
hook remains an installed feature; its exported text does not install that code.

## Place a galaxy

Expand **Galaxy in the 3D viewport**, then choose **Map draft → viewport**. Each
`star-N` object represents one system; empire homes use their empire colours.
This replaces the scene as one scene-history step. Save a ship project before
replacing it, or use scene **Undo** to return to it.

Select a star in the hierarchy or viewport. Move it with the transform gizmo,
Shift-drag, or the Inspector's position fields. **F** frames the selection;
**Shift+F** frames the scene. Right-drag/Alt-drag orbits and the wheel zooms.
Choose **Apply viewport positions** to validate and commit the new layout.

One scene unit equals two chart units. Scene **X/Z** becomes chart **X/Y**;
height is not part of the galaxy map. Keep exactly one object named `star-N` for
every system. Duplicate or missing stars are rejected without changing the draft.
Select a star and use **Connect lane / Remove lane** or **Set home at selected
star** for topology and starting positions. Lanes must remain reciprocal and the
galaxy connected; empire homes must remain valid and distinct. Moving a scene
object alone does not change those relationships. The viewport displays star
geometry, not a live strategic simulation or a starlane overlay.

## Build a ship family

Use the Workbench's scene, hierarchy and Asset Foundry controls to assemble local
geometry. **Import OBJ**, select its declared licence, then **Attach to selected**.
Child entities are included in the selected parent's projection. Built-in boxes
also work, with an `OWNER-LOCAL-ONLY` source declaration.

Expand **Selected geometry → ship hull**, select a campaign hull, then choose
**Preview selected geometry**. Inspect the silhouette and source declarations
before choosing **Apply projected hull**. Changing the scene invalidates an old
preview. Hull geometry and provenance are applied together or rejected together.

The projection is a centred, scaled **convex X/Z silhouette**. It discards height,
concave notches, materials, textures, physics, controllers and triggers. Those
scene components never become weapons or game rules. Hull slots and statistics,
components, starting ship classes and empire names remain editable in the
campaign `.txt` files and the game's record forms.

**Export hull + provenance** creates a `voidward.workbench-hull.v1` JSON bundle.
Import it using **Ship families → Import Workbench hull** in the game. The bundle
contains a native Workbench project plus all source, SHA-256, licence and operation
rows for that hull. The game also accepts ordinary native project JSON. Its
**Export hull to Workbench** option supports a single representable source;
multiple declarations or long source names require the bundle. Importing and
projecting geometry remains the deliberate convex conversion described above;
"lossless" refers to retained provenance, not arbitrary geometry fidelity.

Use **Export project / Open project** for editable scene/assets. The native
project format cannot carry the bundle's complete attribution history: retain
the bundle alongside it. Do not feed a hull bundle directly to native Open
project. Declarations document the source's claims; they do not verify ownership
or automatically grant permission to redistribute a user asset.

## Text, recovery and offline work

**Campaign text files** provides the same names, empires, rules, map, components,
ships, objectives and event formats as the game. Choose **Validate & apply text**
before exporting. Errors leave the last accepted draft intact. Unapplied text
survives switching files in this open editor tab, but is not exported or saved
to recovery. Campaign history retains up to 16 undo/redo snapshots within a
4 MiB encoded budget; older entries are discarded first.

Accepted edits save a campaign recovery copy locally. **Restore campaign draft**
recovers that copy after a reload. Opening the editor alone does not overwrite it.
Scene recovery is separate: **Restore draft** restores scene/assets, and scene
Undo/Redo does not undo campaign edits. Recovery stores the last accepted content,
not undo history. Export both campaign and project files to keep portable copies.
Storage quotas can prevent recovery; the status message reports that failure.

The root service worker caches the editor, renderer modules, campaign data and
game together. After the first complete installation, both pages reload offline
under `/4XGAMES/`. Cache names are scoped to the deployment path. Editor handoff
and recovery keys are separate from VANILLAJS's own editor on the same origin;
existing `voidward.save.v1.*` and preference keys are unchanged. As with other
browser local storage, another 4XGAMES copy on the **same origin** shares these
keys; use a different port/origin to isolate a development checkout.

## Preview and limits

The top **Play / Pause / Stop** buttons run the scene's physics preview, not the
turn-based campaign. Campaign controls are disabled during scene Play. The
default viewport uses WebGL; **Add CPU + optional GPU/WASM** selects the donor's
alternate renderer. GPU mode needs a supported device and explicit selection;
it is optional and does not change game rules. No speedup or hardware-acceleration
claim follows merely from opening the editor.

**Export scene preview** downloads HTML for the scene. Put it in the repository
root beside `vendor/` and serve it over HTTP. It depends on this local package;
it is not a standalone campaign. Share the campaign export for a playable 4X mod.

| Format or operation | Limit |
| --- | --- |
| Native campaign text content | 500 KB; portable envelope admission 1 MB |
| Mod SDK exchange | 32 KiB, with the donor's string/depth/node bounds |
| Native scene/assets project | 256 KiB, 128 scene objects, 32 assets |
| OBJ import | 64 KiB, up to 512 output triangles |
| PNG import | 64 × 64 pixels |
| Hull bundle | 512 KiB envelope, embedded project still 256 KiB |
| Campaign provenance | Up to 128 rows across the campaign |
| Hull projection | 3–40 boundary points, extent 4–60 chart units |
| Galaxy | 4–64 systems, coordinates within ±2000 chart units |

The integration is pinned to VANILLAJS
`b12f24f789da81325491f96b5c2dd786d31e96f0` (PR #81). Donor modules remain
byte-for-byte copies recorded in [PROVENANCE.json](../vendor/PROVENANCE.json).
Local adaptations live in `editor/`, `js/editor-workflow.js`,
`js/workbench-bridge.js` and `js/app.js`. Existing campaign data, authoritative
simulation, version-1 migration and save budgets retain their contracts.

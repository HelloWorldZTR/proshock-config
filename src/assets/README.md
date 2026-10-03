# Controller visual assets

`dualshock-4-layout.svg` is the DualShock 4 front-layout illustration by
Tokyoship, downloaded from Wikimedia Commons:

<https://commons.wikimedia.org/wiki/File:Dualshock_4_Layout.svg>

It is licensed under CC BY 3.0:
<https://creativecommons.org/licenses/by/3.0/>. The artwork is bundled without
modification and is used only by the Mapping editor.

`dualshock-controller.svg` is extracted from
[`dualshock-tools.github.io`](https://github.com/dualshock-tools/dualshock-tools.github.io)
at commit `1dd51cd50adec43df9b71cda91ac145f30865d00`.

This asset remains the live controller visual used by Home and Diagnostics.
It is distributed under the MIT license in `dualshock-tools-LICENSE.txt`.

`proshock-board.glb` is the board owner's ProShock 8K PCB exported from
嘉立创EDA专业版 (JLC EDA Pro) on 2026-09-30 as an OBJ with only the PCB,
component models, and silkscreen. Signal-layer traces and vias were excluded
from the export. The exported OBJ/MTL was converted to GLB, optimized, and
compressed with meshopt for the Accessory Center. The export uses a black PCB
finish and includes the newly associated FPC2 3D connector. JLC EDA
reported M1, U1, U2, U3, and U4 as lacking bound 3D models; its automatic
height-based placeholders were enabled for those parts. The page's hot spots
are anchored to the board's back side. The safe OBJ/MTL export is retained as
`/Users/andy/Downloads/ProShock4-Accessory-NoTraces-20260930.zip`. The
`prebuild`, `prebuild:dev` and `predev` scripts reject a different model hash
until its trace-free export settings are reviewed and the approved hash updated.

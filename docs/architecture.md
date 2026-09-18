<!--
  Themed by GitHub, not by us.

  This carried a full `themeVariables` block pinned to the product's dark palette, which overrode
  the light/dark theme GitHub picks for a reader and rendered the whole thing as a black slab on a
  white README. Only the two accent strokes are set now, at values that clear 3:1 on both #ffffff
  and #0d1117, so fills and type follow whichever theme the reader is on.

  It is also about a third shorter. A linear pipeline drawn top to bottom grows without limit, so
  the stages that the README's table already walks through one by one are folded into the boxes
  they belong to, and what is left is the shape of the thing: a cycle through a graph, with a person
  standing in it.
-->

```mermaid
%%{init: {"flowchart": {"htmlLabels": true}}}%%
flowchart TB
    CANON[("<b>Canon</b> · in the DKG<br/>constraints, accepted lessons,<br/>and who approved each")]
    COMPILE["<b>Compile the prompt</b><br/>every clause keeps the row it came from"]
    RENDER["<b>Render and review, shot by shot</b><br/>flux-schnell · kontext-edit · ltx-25-i2v-fast<br/>nemotron-omni-video watches each clip and sends failures back"]
    CUT["<b>Assemble, judge, distil</b><br/>ffmpeg-concat · one verdict per criterion<br/>findings become candidate rules"]
    HUMAN{{"<b>You decide</b> · accept · pin · edit · reject"}}
    OTHER[("Another studio's<br/>shared memory")]
    LEDGER[("<b>Run ledger, and the production record</b><br/>capability · cost · hashes · verdicts · every clause<br/>sealed to Verifiable Memory as a UAL")]

    CANON -->|"the rows that steer this render"| COMPILE
    COMPILE --> RENDER --> CUT
    CUT -->|"proposed only"| HUMAN
    OTHER -->|"inherited, attributed"| HUMAN
    HUMAN -->|"accepted only"| CANON
    CUT -.->|"every call, every clause"| LEDGER

    classDef knowledge stroke:#a8871f,stroke-width:2px
    classDef gate stroke:#2f9d75,stroke-width:2px
    class CANON,LEDGER,OTHER knowledge
    class HUMAN gate
```

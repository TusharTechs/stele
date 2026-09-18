<!--
  Sized for the page it is read on, and themed by whoever is reading it.

  Two things were wrong with the first version. It pinned a full `themeVariables` block to the
  product's dark palette, which overrode the light/dark theme GitHub picks per reader and rendered
  the whole diagram as a black slab on a white README. Only the two accent strokes are set now, at
  values clearing 3:1 on both #ffffff and #0d1117, so fills and type follow the reader.

  And it was drawn top to bottom, which for a linear pipeline grows without limit. The trap is that
  shrinking the source does nothing: GitHub stretches the SVG to the width of the README column, so
  the rendered height is set by the aspect ratio alone. A narrower diagram is a taller one. Measured
  at a 950px column, the portrait version came out about 1800px tall; this one is 1129 by 520 and
  renders at 950 by 438, with the type still large enough to read.

  Getting there meant folding the stages that the table above already walks through one by one into
  the single box they belong to. What is left is the shape that carries the argument: a cycle
  through a graph, with a person standing in it.
-->

```mermaid
flowchart LR
    CANON[("<b>Canon</b> · in the DKG<br/>constraints and accepted<br/>lessons, and who approved each")]
    ATTEMPT["<b>One attempt</b> · every call on Livepeer Agent<br/>compile the prompt, clause by clause<br/>flux-schnell · kontext-edit · ltx-25-i2v-fast<br/>nemotron-omni-video reviews and sends failures back<br/>ffmpeg-concat, then one verdict per criterion"]
    HUMAN{{"<b>You decide</b><br/>accept · pin<br/>edit · reject"}}
    OTHER[("Another studio's<br/>shared memory")]
    LEDGER[("<b>Run ledger, and the record</b><br/>capability · cost · hashes · verdicts<br/>sealed to Verifiable Memory as a UAL")]

    CANON -->|"the rows that steer it"| ATTEMPT
    ATTEMPT -->|"findings, proposed only"| HUMAN
    OTHER -->|"inherited, attributed"| HUMAN
    HUMAN -->|"accepted only"| CANON
    ATTEMPT -.->|"every call, every clause"| LEDGER

    classDef knowledge stroke:#a8871f,stroke-width:2px
    classDef gate stroke:#2f9d75,stroke-width:2px
    class CANON,LEDGER,OTHER knowledge
    class HUMAN gate
```

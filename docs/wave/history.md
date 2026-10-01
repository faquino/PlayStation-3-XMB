# History: superseded readings, closed investigations and dead ends

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md). Nothing here is needed for everyday work:
the topics hold what is known now. Read it to reopen a question, or before following a lead that
may already be ruled out.

## Ruled out

- **The captures' y running down the screen.** Plotted beside a frame of a video recorded the
  same minute, a capture's wave looked upside down. It is not. In the captures the icons'
  category row sits at y = +0.463, at the top of the screen as in the video - see [Where the icons
  are](../particles/flow-grid.md#where-the-icons-are). The wave's tilt changes sign over time: two
  frames of that video, 25 seconds apart, tilt opposite ways.
- **`b380` as a descriptor list run by an interpreter** - upstream's [b380 and the descriptor
  executor](../../SPLINE_REVERSE_ENGINEER.md#b380-and-the-descriptor-executor). It is the
  deformation's lattice of 11 × 7 × 7 points - see [The lattice](inputs.md#the-lattice). What the
  code upstream called its executor, `LAB_00007b30`, does is not followed.
- **`b300` as sixteen scalar parameters** - upstream's [How b300 is
  used](../../SPLINE_REVERSE_ENGINEER.md#how-b300-is-used). It is the matrix from the wave's space
  to clip space, and the four helpers upstream traced multiply it by a point - see [The
  matrix](inputs.md#the-matrix).
- **`FUN_00003c68` as a normalisation** - upstream's [Main table and
  normalization](../../SPLINE_REVERSE_ENGINEER.md#main-table-and-normalization). It is the
  free-form deformation - see [The deformation](spu-task.md#the-deformation).
- **The table built on the SPU from `b380`** - upstream's [What is missing for perfect
  replica](../../SPLINE_REVERSE_ENGINEER.md#what-is-missing-for-perfect-replica). The table arrives
  by DMA from main memory, and the SPU only deforms and transforms it - see [The
  steps](spu-task.md#the-steps).
- **The second vector as a normal in camera space.** Against the mesh's own normal in camera
  space, its direction agrees only to a median |cos| of 0.63. In clip space it agrees to 1.0000 -
  see [The mesh](output.md#the-mesh).

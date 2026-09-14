"""Known caveats of the current model, shown under the board.

Keep these in step with the measured weaknesses in CLAUDE.md ("Model rules") and remove a note as
soon as the backtest shows the issue fixed.
"""

from app.schemas import ModelNote

MODEL_NOTES: tuple[ModelNote, ...] = (
    ModelNote(lens="defence", text="Clean-sheet chances currently run about 4 points high; the ranking is unaffected."),
    ModelNote(
        lens="overall",
        text="Strong favourites are rated slightly too cautiously, and newly promoted clubs are learned slowly.",
    ),
)

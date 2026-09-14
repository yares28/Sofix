from app.services.scoring import difficulty_label, difficulty_score


def test_easy():
    assert difficulty_score(0.7, 0.2, 0.1) < 40


def test_hard():
    assert difficulty_score(0.15, 0.2, 0.65) > 70


def test_labels():
    assert [difficulty_label(x) for x in (30, 40, 55, 68, 80)] == ["Easy", "Easy-ish", "Normal", "Hard-ish", "Hard"]

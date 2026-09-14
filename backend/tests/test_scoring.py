from app.services.scoring import difficulty_score,difficulty_label
def test_easy(): assert difficulty_score(.7,.2,.1)<40
def test_hard(): assert difficulty_score(.15,.2,.65)>70
def test_labels():
    assert [difficulty_label(x) for x in (30,40,55,68,80)]==["Easy","Easy-ish","Normal","Hard-ish","Hard"]

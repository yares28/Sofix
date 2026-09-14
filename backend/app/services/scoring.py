def normalize_probs(w,d,l):
    vals = [max(float(w),0), max(float(d),0), max(float(l),0)]
    s = sum(vals)
    return (1/3,1/3,1/3) if s == 0 else tuple(v/s for v in vals)

def expected_points(w,d):
    return 3*w+d

def difficulty_score(w,d,l):
    w,d,l = normalize_probs(w,d,l)
    return max(0.0, min(100.0, 100.0*(1.0-expected_points(w,d)/3.0)))

# Upper bounds for Easy / Easy-ish / Normal / Hard-ish, set by the backtest so labels cover
# 15 / 20 / 30 / 20 / 15 % of fixtures (reports/backtest_laliga.md, section 6).
LABEL_THRESHOLDS = (37.4, 48.6, 61.1, 71.3)
LABELS = ("Easy", "Easy-ish", "Normal", "Hard-ish", "Hard")

def label_bucket(label):
    """1 (easiest) … 5 (hardest). The tile colour must come from the same label the tooltip shows."""
    return LABELS.index(label) + 1

def difficulty_label(score):
    easy, easyish, normal, hardish = LABEL_THRESHOLDS
    if score <= easy: return "Easy"
    if score <= easyish: return "Easy-ish"
    if score <= normal: return "Normal"
    if score <= hardish: return "Hard-ish"
    return "Hard"

from math import exp, factorial
import numpy as np

def pmf(k, lam):
    lam = max(0.05,float(lam))
    return exp(-lam)*lam**k/factorial(k)

def outcome_probs(lam_home, lam_away, max_goals=8):
    h = np.array([pmf(i,lam_home) for i in range(max_goals+1)])
    a = np.array([pmf(i,lam_away) for i in range(max_goals+1)])
    m = np.outer(h,a); m = m/m.sum()
    ph = float(np.tril(m,-1).sum())
    pd = float(np.trace(m))
    pa = float(np.triu(m,1).sum())
    s = ph+pd+pa
    return ph/s,pd/s,pa/s

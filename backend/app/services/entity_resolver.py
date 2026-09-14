import re, unicodedata

ALIASES = {
 "barcelona":"FC Barcelona",
 "fc barcelona":"FC Barcelona",
 "real madrid":"Real Madrid",
 "atletico madrid":"Atlético de Madrid",
 "athletic bilbao":"Athletic Club",
 "ath bilbao":"Athletic Club",
 "athletic club":"Athletic Club",
 "real sociedad":"Real Sociedad",
 "sociedad":"Real Sociedad",
 "betis":"Real Betis",
 "real betis":"Real Betis",
 "alaves":"Deportivo Alavés",
 "deportivo alaves":"Deportivo Alavés",
 "espanol":"RCD Espanyol",
 "espanyol":"RCD Espanyol",
 "celta":"RC Celta",
 "celta vigo":"RC Celta",
 "villarreal":"Villarreal CF",
 "valencia":"Valencia CF",
 "osasuna":"CA Osasuna",
 "getafe":"Getafe CF",
 "sevilla":"Sevilla FC",
 "rayo vallecano":"Rayo Vallecano",
 "levante":"Levante UD",
 "elche":"Elche CF",
 "malaga":"Málaga CF",
 "deportivo":"RC Deportivo",
 "racing santander":"Racing Santander"
}

def norm(s: str):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+"," ",s).strip()

def canonical_name(s: str):
    return ALIASES.get(norm(s),s.strip())

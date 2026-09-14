from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.api import router
app=FastAPI(title="La Liga Fixture Difficulty API",version="0.1.0")
app.add_middleware(GZipMiddleware,minimum_size=1024)  # the fixture grid is a few hundred KB of JSON
# The Next.js app calls the API from its server, without cookies.
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:3000"],allow_credentials=False,allow_methods=["GET"],allow_headers=["*"])
app.include_router(router)

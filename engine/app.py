"""TESSRA scheduling service — FastAPI wrapper around the CP-SAT engine.

Run locally:   uvicorn app:app --host 0.0.0.0 --port 8000  (from engine/)
Deploy on Render/Railway; point the Next.js app at it with ENGINE_URL.
Long solves must run here, never inside a serverless function.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import apply_disruption, build_schedule, check_assignment  # noqa: E402

app = FastAPI(title="TESSRA Scheduling Engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ENGINE_ALLOWED_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
TOKEN = os.environ.get("ENGINE_TOKEN")


def auth(authorization: str | None):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid engine token")


class SolveRequest(BaseModel):
    data: dict
    disruption: dict | None = None
    baseline: dict | None = None
    team: str = "TESSRA"
    time_limit: float = Field(default=60.0, gt=0, le=600)


class CheckRequest(BaseModel):
    data: dict
    assignment: dict[str, list]  # sid -> [day, start, room]


@app.get("/health")
def health():
    import ortools
    return {"ok": True, "engine": "cp-sat", "ortools": ortools.__version__}


@app.post("/solve")
def solve(req: SolveRequest, authorization: str | None = Header(default=None)):
    auth(authorization)
    data = apply_disruption(req.data, req.disruption) if req.disruption else req.data
    return build_schedule(data, team=req.team, time_limit=req.time_limit, baseline=req.baseline)


@app.post("/check")
def check(req: CheckRequest, authorization: str | None = Header(default=None)):
    auth(authorization)
    assign = {sid: (v[0], int(v[1]), v[2]) for sid, v in req.assignment.items()}
    violations = check_assignment(req.data, assign)
    return {"ok": not violations, "violations": violations}

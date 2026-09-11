from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RECIPIENTS_FILE = ROOT / "sms_recipients.json"
LOG_FILE = ROOT / "sms_log.json"
DEFAULT_RECIPIENTS = [
    {"id":"demo-001","name":"Demo Citizen 1","phone":"+919999999999","village":"Sialsuk","active":True},
    {"id":"demo-002","name":"Demo Citizen 2","phone":"+919999999998","village":"Aizawl_Rural1","active":True},
]

def _read_json(path: Path, default):
    try:
        if not path.exists(): return default
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return default

def _write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")

def _ensure_store():
    if not RECIPIENTS_FILE.exists(): _write_json(RECIPIENTS_FILE, DEFAULT_RECIPIENTS)
    if not LOG_FILE.exists(): _write_json(LOG_FILE, [])

def list_recipients(village: str | None = None):
    _ensure_store(); rows=_read_json(RECIPIENTS_FILE, [])
    if not isinstance(rows,list): return []
    if village: rows=[r for r in rows if str(r.get("village",""))==village]
    return [r for r in rows if r.get("active",True)]

def register_recipient(name: str, phone: str, village: str):
    name=str(name).strip()[:80]; phone=str(phone).strip(); village=str(village).strip()
    if not name: raise ValueError("Name is required")
    if not village: raise ValueError("Village is required")
    normalized=phone.replace(" ","").replace("-","")
    if not re.fullmatch(r"\+?[1-9]\d{9,14}",normalized): raise ValueError("Enter a valid mobile number with country code, e.g. +919876543210")
    _ensure_store(); rows=_read_json(RECIPIENTS_FILE,[])
    if not isinstance(rows,list): rows=[]
    for row in rows:
        if row.get("phone")==normalized and row.get("village")==village:
            row.update({"name":name,"active":True}); _write_json(RECIPIENTS_FILE,rows); return row
    item={"id":f"citizen-{len(rows)+1:04d}","name":name,"phone":normalized,"village":village,"active":True}; rows.append(item); _write_json(RECIPIENTS_FILE,rows); return item

def _build_message(village, action, risk_score, safe_zone=None):
    loc=f" Nearest safe zone: {safe_zone}." if safe_zone else ""
    return (f"VASUNETRA ALERT: {village} is flagged for {action.lower()} (risk {risk_score:.0f}/100). Follow local authority instructions and be prepared for relocation.{loc}")[:320]

def _twilio_send(phone, message):
    sid=os.getenv("TWILIO_ACCOUNT_SID","").strip(); token=os.getenv("TWILIO_AUTH_TOKEN","").strip(); sender=os.getenv("TWILIO_FROM_NUMBER","").strip()
    if not(sid and token and sender): return {"status":"SIMULATED","provider":"demo","message":"SMS simulated; Twilio is not configured."}
    endpoint=f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    form=urllib.parse.urlencode({"To":phone,"From":sender,"Body":message}).encode()
    auth=base64.b64encode(f"{sid}:{token}".encode()).decode()
    req=urllib.request.Request(endpoint,data=form,headers={"Authorization":f"Basic {auth}","Content-Type":"application/x-www-form-urlencoded"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=15) as resp: body=json.loads(resp.read().decode())
        return {"status":"SENT","provider":"twilio","sid":body.get("sid"),"message":"SMS sent successfully."}
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,json.JSONDecodeError) as exc:
        return {"status":"FAILED","provider":"twilio","message":f"SMS provider error: {exc}"}

def send_alert(village, action, risk_score, safe_zone=None):
    _ensure_store(); recipients=list_recipients(village); message=_build_message(village,action,risk_score,safe_zone); results=[]
    for r in recipients:
        result=_twilio_send(r["phone"],message)
        results.append({"recipient_id":r["id"],"name":r["name"],"phone":"*"*max(0,len(r["phone"])-4)+r["phone"][-4:],**result})
    logs=_read_json(LOG_FILE,[])
    if not isinstance(logs,list): logs=[]
    logs.insert(0,{"timestamp":datetime.now().isoformat(timespec="seconds"),"village":village,"action":action,"risk_score":round(float(risk_score),2),"recipient_count":len(recipients),"results":results,"message":message})
    _write_json(LOG_FILE,logs[:100])
    successful=sum(1 for r in results if r["status"] in {"SENT","SIMULATED"})
    return {"village":village,"message":message,"recipient_count":len(recipients),"successful":successful,"results":results,"mode":"TWILIO" if any(r["provider"]=="twilio" for r in results) else "SIMULATION"}

def recent_logs(limit=20):
    _ensure_store(); rows=_read_json(LOG_FILE,[]); return rows[:max(1,min(int(limit),100))]
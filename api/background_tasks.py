import time
import requests
import threading
from typing import List, Callable

def monitor_lots_task(
    obra_codes: List[str],
    get_recent_alerts_fn: Callable,
    create_alert_fn: Callable
):
    """
    Background Task that polls the company API every 1s to detect status changes.
    Isolated from Flask context.
    """
    print("[MONITOR] Starting Background Monitoring Thread...")
    
    last_status_cache = {} # In-memory cache for change detection
    
    # Pre-populate cache from last alerts to prevent duplicate notifications on restart
    try:
        # Give some time for DB environment to be fully ready
        time.sleep(5)
        recent_alerts = get_recent_alerts_fn(50)
        if recent_alerts and isinstance(recent_alerts, list):
            for al in recent_alerts:
                l_id = al.get('lote_id')
                if l_id and l_id not in last_status_cache:
                    last_status_cache[l_id] = al.get('novo_status')
            print(f"[MONITOR] Pre-cached {len(last_status_cache)} lot statuses from Supabase.")
    except Exception as e:
        print(f"[MONITOR] Failed to pre-cache alerts: {e}")
    
    while True:
        try:
            for code in obra_codes:
                headers = {
                    'User-Agent': 'VallePrime-Cloud-Monitor/2.0',
                    'Accept': 'application/json'
                }
                
                target_url = f"http://177.221.240.85:8000/api/consulta/{code}/"
                
                try:
                    r = requests.get(target_url, headers=headers, timeout=5)
                    if r.status_code == 200:
                        data = r.json()
                        lot_list = data.get('data', [])
                        
                        for lot in lot_list:
                            lot_id = f"{code}-Q{lot.get('QD')}-L{lot.get('LT')}"
                            current_status = lot.get('ST')
                            
                            # Detection of change
                            if lot_id in last_status_cache:
                                if last_status_cache[lot_id] != current_status:
                                    msg = f"Lote {lot.get('LT')} (Q{lot.get('QD')}) alterado para {current_status}"
                                    print(f"✨ [ALERT] {code}: {msg}")
                                    
                                    # Persist to Supabase
                                    try:
                                        create_alert_fn(code, lot_id, last_status_cache[lot_id], current_status, msg)
                                    except:
                                        pass
                                    
                            last_status_cache[lot_id] = current_status
                except Exception:
                    pass
                
                time.sleep(0.5) 
                
            time.sleep(1)
            
        except Exception as e:
            print(f"[MONITOR ERROR] {e}")
            time.sleep(10)

def start_monitor_thread(obra_codes, get_alerts_fn, create_alert_fn):
    monitor_thread = threading.Thread(
        target=monitor_lots_task, 
        args=(obra_codes, get_alerts_fn, create_alert_fn),
        daemon=True
    )
    monitor_thread.start()
    return monitor_thread

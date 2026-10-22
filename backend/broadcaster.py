"""
Arogya Map — In-Memory Realtime Event Broadcaster (Server-Sent Events)
Enables instantaneous real-time bed count and emergency updates across connected clients.
"""
import json
import queue

class Broadcaster:
    def __init__(self):
        self._listeners = []

    def listen(self):
        q = queue.Queue(maxsize=30)
        self._listeners.append(q)
        return q

    def remove(self, q):
        if q in self._listeners:
            self._listeners.remove(q)

    def broadcast(self, payload):
        data_str = json.dumps(payload)
        for i in reversed(range(len(self._listeners))):
            try:
                self._listeners[i].put_nowait(data_str)
            except (queue.Full, Exception):
                self._listeners.pop(i)

broadcaster = Broadcaster()

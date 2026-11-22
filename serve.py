"""Small local web server. Tells the browser to check for new files, so updates show at once."""
import functools
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


here = os.path.dirname(os.path.abspath(__file__))
print("TravelPlanner is running at http://localhost:5173  (close this window to stop)")
ThreadingHTTPServer(("127.0.0.1", 5173), functools.partial(Handler, directory=here)).serve_forever()

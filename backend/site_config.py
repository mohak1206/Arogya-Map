"""
Arogya Map — Site-wide template context.

Registers a context processor that injects a `site` dict into every
template render (including blueprints).  All values come from env vars
with empty-string defaults so templates degrade gracefully.
"""

import os
from datetime import datetime


def init_site_config(app):
    """Call once after the Flask app is created."""

    @app.context_processor
    def inject_site():
        return {
            "site": {
                "name": "Arogya Map",
                "year": datetime.now().year,
                "support_email": os.getenv("SUPPORT_EMAIL", ""),
                "support_phone": os.getenv("SUPPORT_PHONE", ""),
                "location": os.getenv("SITE_LOCATION", ""),
                "hours": os.getenv("SUPPORT_HOURS", ""),
                "social": {
                    "github": os.getenv("SOCIAL_GITHUB", ""),
                    "linkedin": os.getenv("SOCIAL_LINKEDIN", ""),
                    "twitter": os.getenv("SOCIAL_TWITTER", ""),
                },
            }
        }

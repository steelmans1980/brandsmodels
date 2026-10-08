"""Paths, user agent and prices shared by the pipeline."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'campaigns.json')
PHOTOS = os.path.join(ROOT, 'assets', 'photos')  # published photos (deployed)
# downloads wait here until reviewed and applied; pipeline/ is not deployed (.assetsignore)
CANDIDATES = os.path.join(ROOT, 'pipeline', 'candidates', 'photos')
HERE = os.path.join(ROOT, 'pipeline')
CACHE = os.path.join(HERE, 'cache')
LEGACY = os.path.join(HERE, 'legacy')
RESULTS = os.path.join(HERE, 'results')

# Search responses cost money, so their cache is kept in git; fetched pages are not.
SEARCH_DB = os.path.join(CACHE, 'search.sqlite')
PAGES_DB = os.path.join(CACHE, 'pages.sqlite')

# Requests identify themselves honestly; robots.txt is checked for these agents.
USER_AGENT = 'Mozilla/5.0 (compatible; Claude-User/1.0; +https://support.anthropic.com/)'
ROBOTS_AGENTS = ('ClaudeBot', 'Claude-User', 'anthropic-ai', 'Claude-SearchBot')

# US dollars per request (Brave "Search" plan; SerpApi Starter plan per search).
PRICE = {
    'brave_web': 0.005,
    'brave_images': 0.005,
    'serpapi_google_images': 0.025,
}

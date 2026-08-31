import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://liftlog:liftlog@localhost:5434/liftlog")
os.environ.setdefault("AUTH_SECRET", "test-secret")

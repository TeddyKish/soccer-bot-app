import os
import uvicorn


def start_operation():
    """
    Starts the FastAPI server for the web application.
    """
    try:
        port = int(os.getenv("PORT", "8000"))
        uvicorn.run("tfab_web.app:app", host="0.0.0.0", port=port)
    except Exception as e:
        print(str(e))
        exit(1)


if __name__ == '__main__':
    start_operation()
    exit(0)

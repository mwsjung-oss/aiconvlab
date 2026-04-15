FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY . /app

EXPOSE 8000

# Render·리버스 프록시 뒤에서 HTTPS·X-Forwarded-* 를 올바르게 반영합니다.
# PORT: Render 등에서 런타임 주입(로컬은 8000).
# FORWARDED_ALLOW_IPS: 프록시 IP만 신뢰(기본 127.0.0.1)하면 LB 뒤에서 클라이언트 주소가 틀어질 수 있어 * 허용.
CMD ["sh", "-c", "exec python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=\"${FORWARDED_ALLOW_IPS:-*}\""]


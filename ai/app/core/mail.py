"""Plain SMTP for the few e-mails the worker sends (job `dsr_digest`).
The web tier sends the transactional ones (nodemailer)."""

import os
import smtplib
from email.message import EmailMessage


def send(to: list[str], subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = os.environ.get("SMTP_FROM", "no-reply@localhost")
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)
    host, port = os.environ.get("SMTP_HOST", "127.0.0.1"), int(os.environ.get("SMTP_PORT", "587"))
    secure = os.environ.get("SMTP_SECURE") == "true"
    with (smtplib.SMTP_SSL(host, port, timeout=15) if secure else smtplib.SMTP(host, port, timeout=15)) as smtp:
        if not secure and smtp.has_extn("starttls"):
            smtp.starttls()
        if os.environ.get("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
        smtp.send_message(msg)

import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('185.232.14.28', port=65002, username='u196912583', password='Z24312433z@')

sftp = ssh.open_sftp()

# 1. Upload .env to app/.env
with open('d:/Projects/docter-lawyer/.env', 'r', encoding='utf-8') as f:
    env_content = f.read()

with sftp.file('/home/u196912583/domains/lawyer.buzlike.com/app/.env', 'w') as f:
    f.write(env_content)

# 2. Upload api.php to public_html/api.php
with open('d:/Projects/docter-lawyer/api.php', 'r', encoding='utf-8') as f:
    api_content = f.read()

with sftp.file('/home/u196912583/domains/lawyer.buzlike.com/public_html/api.php', 'w') as f:
    f.write(api_content)

# 3. Upload frontend/index.html to public_html/index.html
with open('d:/Projects/docter-lawyer/frontend/index.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

with sftp.file('/home/u196912583/domains/lawyer.buzlike.com/public_html/index.html', 'w') as f:
    f.write(html_content)

# 4. Upload .htaccess to public_html/.htaccess
htaccess_content = '''RewriteEngine On

# Block sensitive files
<FilesMatch "^\\.(env|git|db|sqlite)">
    Order allow,deny
    Deny from all
</FilesMatch>

# Route /api/ to api.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^api/(.*)$ api.php [QSA,L]

DirectoryIndex index.html index.php
'''

with sftp.file('/home/u196912583/domains/lawyer.buzlike.com/public_html/.htaccess', 'w') as f:
    f.write(htaccess_content)

sftp.close()

# Remove default.php if still present
ssh.exec_command('rm -f /home/u196912583/domains/lawyer.buzlike.com/public_html/default.php')

print("Deployment files uploaded successfully!")
ssh.close()

# Ubuntu: open RMS using the server IP

This standalone runtime uses Node 24, SQLite and private disk attachments. Docker keeps the service running after reboot. No Cloudflare account or ChatGPT sign-in is required. Existing hosted records are not automatically copied to this server; its database starts empty.

## 1. Docker and source

For Ubuntu's Docker packages:

```sh
sudo apt update
sudo apt install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker
git clone https://github.com/Meronhyacinth/RMS.git
cd RMS
```

If already cloned, enter the existing directory and run `git pull --ff-only`. If Docker/Compose is already installed, keep the existing installation. If the distro cannot find docker-compose-v2, use Docker's official Ubuntu installation guide: https://docs.docker.com/engine/install/ubuntu/ . Do not mix the distro packages with Docker's official repository packages.

## 2. Configure the address and admin password

```sh
hostname -I
```

Choose the address reachable from your browser computer. Replace the example below with that server address:

```sh
SERVER_IP=192.168.1.50
sudo docker run --rm -it --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work node:24-bookworm-slim \
  node scripts/ubuntu-setup.mjs --origin "http://$SERVER_IP"
```

Enter and confirm the admin password when prompted. Input is hidden. You can use your previously requested password; no password is committed to source. Setup writes a restricted `.env` with a salted hash and a random session secret. Username is `admin`. The default administrative identity is `admin@rms.local`; `--email your-email@example.com` sets a different administrative identity. This does not create an email mailbox.

Setup refuses to overwrite an existing `.env`. To use a different IP later, edit RMS_PUBLIC_ORIGIN in `.env`, then run `sudo docker compose up -d --force-recreate`.

## 3. Run

```sh
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=30 rms
```

Open `http://192.168.1.50` in your browser, replacing the example IP. Port 80 is exposed, so no port suffix is needed. Sign in as admin with the password you entered. Test from the server with `curl -I http://127.0.0.1/`.

This HTTP configuration is for testing on a trusted network. Use HTTPS before entering real personnel data or exposing the service over the internet. With an HTTPS reverse proxy, set RMS_PUBLIC_ORIGIN to the https URL and RMS_HTTP_DEV_MODE to false; the proxy must preserve cookies and the request Origin header. No proxy is configured by this compose file.

The bootstrap username remains `admin` and has the Boss role. HR and Boss can add team leads under Team access and set individual staff passwords. Job-board/email-provider connections are not configured automatically.

## Port and connectivity issues

Check for an existing service on port 80:

```sh
sudo ss -ltnp '( sport = :80 )'
```

To use 8080, change the compose mapping to `8080:3000` and set RMS_PUBLIC_ORIGIN to `http://SERVER_IP:8080`, then recreate the container. Open that URL including the port.

If the page works on the server but not your PC, confirm both are on a reachable network. For a VM, configure bridged networking or a host port-forward; for a cloud server, permit the selected TCP port in its security group. Docker-published ports can bypass UFW rules; use Docker-aware firewall rules or a provider firewall when restricting access.

## Update and storage

```sh
git pull --ff-only
sudo docker compose up -d --build
```

Requests, audit records and attachments persist in the named `rms-data` Docker volume. Ordinary container recreation preserves it. `docker compose down -v` deletes the database and attachments; do not use it to update.

The local runtime applies new SQL migrations at startup and verifies existing migration hashes. It refuses edited migrations that were already applied. Keep `.env` and data private and backed up. For a consistent cold backup, stop RMS, back up its named volume and `.env`, then restart it.

## HR candidates and team-lead interviews

After updating and rebuilding, open **Team access** as Boss or HR, add team leads and use **Set password** (Boss can also add HR/Boss accounts). Each staff member signs in with their email and password. HR adds candidate applications and private résumés under **Candidates & interviews**, then schedules interviews to grant the selected team lead access. See [Candidate workflow](CANDIDATES.md). The new database migration is additive and runs automatically at startup.

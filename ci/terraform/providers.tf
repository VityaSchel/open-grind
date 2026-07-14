# provider "cherryservers" { api_token = var.cherry_api_token }
# provider "vultr" { api_key = var.vultr_api_key }
provider "hcloud" { token = var.hetzner_api_token }
# provider "scaleway" {
#   access_key = var.scaleway_access_key
#   secret_key = var.scaleway_secret_key
#   project_id = var.scaleway_project_id
# }
provider "digitalocean" { token = var.digitalocean_token }

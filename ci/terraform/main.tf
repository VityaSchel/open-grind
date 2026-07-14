locals {
  cloud_init = { for k, r in var.runners : k => join("\n", [
    "#!/bin/bash",
    "FORGEJO_URL='${var.forgejo_url}'",
    "RUNNER_UUID='${r.uuid}'",
    "RUNNER_TOKEN='${r.token}'",
    "RUNNER_LABEL='open-grind-builder-${k}'",
    file("${path.module}/builder.sh"),
  ]) }
}

# resource "cherryservers_server" "builder_a" {
#   project_id  = var.cherry_project_id
#   plan        = var.cherry_plan
#   region      = var.cherry_region
#   image       = var.cherry_image
#   hostname    = "open-grind-builder-a"
#   ssh_key_ids = var.cherry_ssh_key_ids
#   user_data   = base64encode(local.cloud_init["a"])
# }

# resource "vultr_instance" "builder_b" {
#   plan             = var.vultr_plan
#   region           = var.vultr_region
#   os_id            = var.vultr_os_id
#   hostname         = "open-grind-builder-b"
#   label            = "open-grind-builder-b"
#   ssh_key_ids      = var.vultr_ssh_key_ids
#   user_data        = local.cloud_init["b"]
#   activation_email = false
# }

resource "hcloud_server" "builder_c" {
  name        = "open-grind-builder-c"
  server_type = var.hetzner_plan
  location    = var.hetzner_location
  image       = var.hetzner_image
  ssh_keys    = var.hetzner_ssh_key_ids
  user_data   = local.cloud_init["c"]
}

resource "scaleway_instance_server" "builder_d" {
  name              = "open-grind-builder-d"
  type              = var.scaleway_plan
  zone              = var.scaleway_zone
  image             = var.scaleway_image
  enable_dynamic_ip = true
  root_volume { size_in_gb = var.scaleway_root_volume_gb }
  user_data = { "cloud-init" = local.cloud_init["d"] }
}

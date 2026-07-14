# variable "cherry_api_token" {
#   type      = string
#   sensitive = true
# }
# variable "vultr_api_key" {
#   type      = string
#   sensitive = true
# }
variable "hetzner_api_token" {
  type      = string
  sensitive = true
}
# variable "scaleway_access_key" {
#   type      = string
#   sensitive = true
# }
# variable "scaleway_secret_key" {
#   type      = string
#   sensitive = true
# }
variable "digitalocean_token" {
  type      = string
  sensitive = true
}

variable "runners" {
  type = object({
    # a = object({ uuid = string, token = string })
    # b = object({ uuid = string, token = string })
    c = object({ uuid = string, token = string })
    # d = object({ uuid = string, token = string })
    e = object({ uuid = string, token = string })
  })
  sensitive = true
}

variable "forgejo_url" { type = string }

# variable "cherry_project_id" { type = number }
# variable "cherry_plan" { type = string }
# variable "cherry_region" { type = string }
# variable "cherry_image" {
#   type    = string
#   default = "debian_12_64bit"
# }
# variable "cherry_ssh_key_ids" {
#   type    = list(string)
#   default = []
# }

# variable "vultr_plan" { type = string }
# variable "vultr_region" { type = string }
# variable "vultr_os_id" {
#   type    = number
#   default = 2136 # Debian 12 x64
# }
# variable "vultr_ssh_key_ids" {
#   type    = list(string)
#   default = []
# }

variable "hetzner_plan" { type = string }
variable "hetzner_location" { type = string }
variable "hetzner_image" {
  type    = string
  default = "debian-12"
}
variable "hetzner_ssh_key_ids" {
  type    = list(string)
  default = []
}

# variable "scaleway_project_id" { type = string }
# variable "scaleway_plan" { type = string }
# variable "scaleway_zone" { type = string }
# variable "scaleway_image" {
#   type    = string
#   default = "debian_bookworm"
# }
# variable "scaleway_root_volume_gb" {
#   type    = number
#   default = 80
# }

variable "digitalocean_size" { type = string }
variable "digitalocean_region" { type = string }
variable "digitalocean_image" {
  type    = string
  default = "debian-12-x64"
}
variable "digitalocean_ssh_key_ids" {
  type    = list(string)
  default = []
}

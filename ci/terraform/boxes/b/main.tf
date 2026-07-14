terraform {
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "2.31.2"
    }
  }
}

variable "vultr_api_key" {
  type      = string
  sensitive = true
}
variable "vultr_plan" { type = string }
variable "vultr_region" { type = string }
variable "vultr_os_id" {
  type    = number
  default = 2136 # Debian 12 x64
}
variable "vultr_ssh_key_ids" {
  type    = list(string)
  default = []
}
variable "user_data" {
  type      = string
  sensitive = true
}

provider "vultr" { api_key = var.vultr_api_key }

resource "vultr_instance" "builder" {
  plan             = var.vultr_plan
  region           = var.vultr_region
  os_id            = var.vultr_os_id
  hostname         = "open-grind-builder-b"
  label            = "open-grind-builder-b"
  ssh_key_ids      = var.vultr_ssh_key_ids
  user_data        = var.user_data
  activation_email = false
}

output "ip" {
  value = vultr_instance.builder.main_ip
}

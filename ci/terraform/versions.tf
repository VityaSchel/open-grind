terraform {
  required_version = ">= 1.5"
  required_providers {
    cherryservers = { source = "cherryservers/cherryservers", version = "1.5.3" }
    vultr         = { source = "vultr/vultr", version = "2.31.2" }
    hcloud        = { source = "hetznercloud/hcloud", version = "1.66.0" }
    scaleway      = { source = "scaleway/scaleway", version = "2.78.0" }
  }
}

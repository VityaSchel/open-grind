terraform {
  required_version = ">= 1.5"
  required_providers {
    cherryservers = { source = "cherryservers/cherryservers", version = "1.5.3" }
    vultr         = { source = "vultr/vultr", version = "2.31.2" }
  }
}

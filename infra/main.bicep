targetScope = 'resourceGroup'

param name string = 'conversation-evaluation-demo'
param location string = 'westeurope'

resource site 'Microsoft.Web/staticSites@2024-11-01' = {
  name: name
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: 'web'
      apiLocation: 'api'
      appArtifactLocation: ''
    }
  }
}

output hostname string = site.properties.defaultHostname

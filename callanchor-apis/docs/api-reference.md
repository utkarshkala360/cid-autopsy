# CallAnchor API reference

Generated from `openapi/callanchor.openapi.yaml` and `fixtures/` by
`npm run generate:reference`. Do not edit by hand.

Set these before running a command. The session comes from `npm run login`.

```bash
export CALLANCHOR_SESSION=$(cat .session)
export CLIENT_ID=<client id>
```

Samples show the first 2 items of each list. Every value in them is redacted.

## Auth

### sendOtp

Place an OTP call to a portal user. `POST /api/auth/send-otp`. Safety: auth. From a saved sample, not checked live.

> Part of the login flow. `sendOtp` places a real phone call.

```bash
curl -s -X POST "https://app.360callanchor.com/api/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"'"$CALLANCHOR_MOBILE"'","mode":"mobile"}'
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "message": "OTP call originated successfully",
  "otpSentTo": "+910000000030",
  "otpChannel": "mobile"
}
```

</details>

### verifyOtp

Exchange an OTP for a portal session. `POST /api/auth/verify-otp`. Safety: auth. From a saved sample, not checked live.

> Part of the login flow. `sendOtp` places a real phone call.

```bash
curl -s -X POST "https://app.360callanchor.com/api/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"'"$CALLANCHOR_MOBILE"'","mode":"mobile","otp":"'"$OTP"'"}' \
  -c cookies.txt
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "kind": "support",
  "supportUserId": "cmsyix18z0cu010ngtzobg0nf",
  "portalUserId": "cmsyix18w0cty10ngdavp4ppz",
  "name": "Person 11",
  "email": "user9@example.test",
  "mobile": "+910000000030",
  "profileImageUrl": "/uploads/profile-images/redacted.jpg",
  "roleId": "support_agent",
  "permissions": [
    "clients:read",
    "clients:write",
    "… 2 more"
  ],
  "logAccess": {
    "canViewSystemLogs": true,
    "canViewAuditLogs": true
  }
}
```

</details>

### getPortalProfile

Who the session belongs to; the session validity check. `GET /api/portal/profile`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/portal/profile" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "profile": {
    "portalUserId": "cmsample0000portaluser00000",
    "name": "Person 11",
    "email": "user1@example.test",
    "mobile": "+910000000001",
    "profileImageUrl": "/uploads/profile-images/redacted.jpg"
  }
}
```

</details>

### getAuthMe

The signed-in user, with role, permissions and log access. `GET /api/auth/me`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/auth/me" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "authenticated": true,
  "profile": {
    "kind": "support",
    "supportUserId": "cmsyix18z0cu010ngtzobg0nf",
    "portalUserId": "cmsyix18w0cty10ngdavp4ppz",
    "name": "Person 51",
    "email": "user51@example.test",
    "mobile": "+910000009001",
    "profileImageUrl": "/uploads/profile-images/redacted.jpg",
    "roleId": "support_agent",
    "permissions": [
      "clients:read",
      "clients:write",
      "… 2 more"
    ],
    "logAccess": {
      "canViewSystemLogs": true,
      "canViewAuditLogs": true
    }
  }
}
```

</details>

## Fleet

### getFleet

Fleet totals and one metrics row per client. `GET /api/fleet`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/fleet" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "totalCalls": 45990,
  "callsToday": 779,
  "failedCallouts24h": 129,
  "totalLicenses": 120,
  "trialsNearLimit": [
    {
      "clientId": "cmvan8c5t1mpf114m8m4guayg",
      "companyName": "Person 9"
    },
    {
      "clientId": "cmt12xvwk0nasmnhxn8dy32hw",
      "companyName": "Person 19"
    }
  ],
  "clientMetrics": [
    {
      "clientId": "cmvxhxexeakoq7l8f0dbs375i",
      "companyName": "Person 4",
      "status": "trial",
      "totalCalls": 0,
      "callsToday": 0,
      "failedCallouts24h": 0,
      "totalLicenses": 1,
      "contractRecordedCalls": 0,
      "contractPlatformSyncs": 0,
      "contractRecordingLimit": 10,
      "contractSyncLimit": 10,
      "trialRecordedCalls": 0,
      "trialPlatformSyncs": 0,
      "trialRecordingLimit": 10,
      "trialPlatformSyncLimit": 10,
      "activeIntegrations": 0,
      "syncedRate": 0
    }
  ],
  "callRecords": [
    {
      "id": "cmvzb7beochcs7l8fbd9svwlm",
      "calleeId": "phone-0000000028",
      "calleeName": "Unknown",
      "calleePhone": "+910000000028",
      "agent": "Person 2",
      "duration": "01:23",
      "datetime": "2026-11-02T13:41:38.488Z",
      "datetimeLabel": "2 Nov 2026 · 07:11 pm",
      "type": "Incoming"
    }
  ]
}
```

</details>

## Clients

### listClients

List all clients. `GET /api/clients`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
[
  {
    "id": "cmvxhxexeakoq7l8f0dbs375i",
    "companyName": "Person 4",
    "contactName": "Person 22",
    "email": "user1@example.test",
    "phone": "+910000000001",
    "plan": "Trial",
    "status": "trial",
    "accessSuspended": false,
    "createdAt": "2026-11-01",
    "licenseCount": 1,
    "licenseNumbers": [
      "+910000000001"
    ],
    "portalAdminMobiles": [
      "+910000000001"
    ],
    "numbers": [],
    "platforms": [
      {
        "id": "salesforce",
        "name": "Salesforce",
        "active": false
      },
      {
        "id": "zoho",
        "name": "Zoho",
        "active": false
      },
      "… 2 more"
    ]
  }
]
```

</details>

### getClient

One client. `GET /api/clients/{clientId}`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "id": "cmvp1b1fu43jk7l8f88qbvkov",
  "companyName": "Person 3",
  "contactName": "Person 5",
  "email": "user2@example.test",
  "phone": "+910000000002",
  "plan": "Trial",
  "status": "trial",
  "accessSuspended": false,
  "createdAt": "2026-10-26",
  "licenseCount": 5,
  "licenseNumbers": [
    "+910000000003",
    "+910000000004",
    "… 3 more"
  ],
  "portalAdminMobiles": [
    "+910000000002"
  ],
  "numbers": [],
  "platforms": [
    {
      "id": "salesforce",
      "name": "Salesforce",
      "active": true,
      "connectedAt": "2026-10-26"
    },
    {
      "id": "zoho",
      "name": "Zoho",
      "active": false
    },
    "… 2 more"
  ]
}
```

</details>

### getClientTenant

Everything about one client. `GET /api/clients/{clientId}/tenant`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/tenant" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "clientId": "cmvp1b1fu43jk7l8f88qbvkov",
  "viewerTeamMemberId": null,
  "viewerTeamMemberName": null,
  "callRecords": [
    {
      "id": "cmvzagkz1cf5f7l8fchqj1okj",
      "calleeId": "phone-0000000008",
      "calleeName": "Unknown",
      "calleePhone": "+910000000008",
      "agent": "Person 1",
      "teamMemberId": "cmvs21lit5pja7l8flvsfgi3o",
      "duration": "00:33",
      "durationSeconds": 33,
      "datetime": "2026-11-02T13:10:40.423Z",
      "datetimeLabel": "2 Nov 2026 · 06:40 pm",
      "type": "Outgoing",
      "recordingStatus": "synced",
      "platformSyncStatus": "synced",
      "recordingUnavailableReason": null,
      "recordingPermissionDisabledAt": null,
      "anyIntegrationSynced": true,
      "dispositionLabel": null,
      "dispositionNote": "<agent note>",
      "dispositionScheduledAt": "2026-11-02T13:23:00.000Z",
      "dispositionDisplayFields": [
        {
          "slug": "project-name",
          "label": "Project Name",
          "type": "single_select",
          "displayValue": "acme-avantara"
        },
        {
          "slug": "task-subject",
          "label": "Task Subject",
          "type": "single_select",
          "displayValue": "follow-up"
        },
        "… 5 more"
      ],
      "aiInsightStatus": null,
      "aiInsightErrorCode": null,
      "aiOverallSentiment": null,
      "aiSentimentScore": null,
      "aiCreditsUsed": null
    }
  ],
  "licenses": [
    {
      "id": "cmvs21liw5pjc7l8f4xvu29gy",
      "number": "+910000000003",
      "status": "assigned",
      "assignedTo": {
        "id": "cmvs21lit5pja7l8flvsfgi3o",
        "name": "Person 1",
        "email": "user3@example.test",
        "role": "Agent"
      },
      "assignedAtLabel": "28 Oct 2026",
      "lastLoginLabel": "28 Oct 2026 · 05:40 pm",
      "lastLoginDevice": "Samsung SM-A076B",
      "lastLoginAndroidBrand": "samsung",
      "lastLoginAndroidModel": "SM-A076B",
      "lastLoginFirmwareVersion": "BP4A.251205.006",
      "lastLoginGoogleDialerPresent": false,
      "lastLoginAppVersion": "1.0.6(7)",
      "lastLoginAppVersionCode": 7,
      "isLoggedIn": true,
      "isActive": true,
      "callCapturePolicy": null,
      "recordingEnabled": null,
      "allowMobileLogout": null,
      "lifetimeCallRecordCount": 38,
      "loginHistory": [
        {
          "id": "latest-activity",
          "title": "Latest Activity",
          "description": "Outgoing call to Unknown",
          "at": "2 Nov 2026 · 04:34 pm",
          "tone": "slate",
          "icon": "activity"
        },
        {
          "id": "first-outreach",
          "title": "First Outreach",
          "description": "Outgoing call to Unknown",
          "at": "28 Oct 2026 · 05:53 pm",
          "tone": "green",
          "icon": "outreach"
        },
        "… 1 more"
      ]
    },
    {
      "id": "cmvs21lhf5pii7l8fwnb1iwas",
      "number": "+910000000004",
      "status": "assigned",
      "assignedTo": {
        "id": "cmvs21lhc5pig7l8fscoajcp0",
        "name": "Person 6",
        "email": "user4@example.test",
        "role": "Agent"
      },
      "assignedAtLabel": "28 Oct 2026",
      "lastLoginLabel": "30 Oct 2026 · 05:12 pm",
      "lastLoginDevice": "Samsung SM-A076B",
      "lastLoginAndroidBrand": "samsung",
      "lastLoginAndroidModel": "SM-A076B",
      "lastLoginFirmwareVersion": "BP4A.251205.006",
      "lastLoginGoogleDialerPresent": false,
      "lastLoginAppVersion": "1.0.6(7)",
      "lastLoginAppVersionCode": 7,
      "isLoggedIn": true,
      "isActive": true,
      "callCapturePolicy": null,
      "recordingEnabled": null,
      "allowMobileLogout": null,
      "lifetimeCallRecordCount": 0,
      "loginHistory": [
        {
          "id": "latest-activity",
          "title": "Latest Activity",
          "description": null,
          "at": null,
          "tone": "slate",
          "icon": "activity"
        },
        {
          "id": "first-outreach",
          "title": "First Outreach",
          "description": null,
          "at": null,
          "tone": "slate",
          "icon": "outreach"
        },
        "… 1 more"
      ]
    },
    "… 3 more"
  ],
  "integrations": [
    {
      "platformId": "salesforce",
      "platformName": "Salesforce",
      "active": true,
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "authMode": "oauth2",
      "authFields": {
        "authorizationScheme": "Bearer",
        "clientId": "",
        "clientSecret": "",
        "grantType": "refresh_token",
        "tokenUrl": "https://login.salesforce.com/services/oauth2/token",
        "refreshToken": "",
        "accessToken": "",
        "instanceUrl": "https://acme.my.salesforce.com",
        "tokenIssuedAt": "1793624212006"
      },
      "authFieldMasks": {
        "clientId": "•••",
        "clientSecret": "•••",
        "refreshToken": "•••",
        "accessToken": "•••"
      },
      "isCustom": true,
      "scheduler": {
        "frequency": "realtime",
        "enabled": true
      },
      "eventTypes": [],
      "connectedAt": "2026-10-26",
      "lastHealthCheck": "2026-11-02T13:40:42.885Z"
    },
    {
      "platformId": "zoho",
      "platformName": "Zoho",
      "active": false,
      "endpoint": "https://hooks.callanchor.io/zoho",
      "authMode": "oauth2",
      "authFields": {},
      "isCustom": false,
      "scheduler": {
        "frequency": "1h",
        "enabled": true
      },
      "eventTypes": [],
      "lastHealthCheck": "2026-11-02T13:41:05.294Z"
    }
  ],
  "callAnchorLogs": [
    {
      "id": "cmvzb41d0ch4d7l8ftothpzjf",
      "requestId": "cmvzb41cuch4b7l8fdgmtj699",
      "platformId": "salesforce",
      "eventType": "recording.ready",
      "callId": "cmvzb3znjch347l8fh4bl7yzh",
      "calleeName": "Unknown",
      "attempt": 1,
      "status": "delivered",
      "httpStatus": 201,
      "durationMs": 1283,
      "at": "2026-11-02T13:40:42.852Z",
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "payloadPreview": "{\n  \"event\": \"recording.ready\",\n  \"hasRecording\": true,\n  \"call\": {\n    \"id\": \"cmvzb3znjch347l8fh4bl7yzh\",\n    \"agentName\": \"Person 1\",\n    \"agentNumber\": \"+910000000003\",\n    \"calleeName\": \"Unknown\",\n    \"calleePhone\": \"+910000000009\",\n   …",
      "responsePreview": "{\n  \"salesTaskId\": \"a0D000000000000001\",\n  \"activityId\": \"00T000000000000002\",\n  \"opportunityId\": \"006000000000000003\",\n  \"success\": true\n}",
      "externalRecordId": "a0D000000000000001"
    },
    {
      "id": "cmvzb3kvhch2n7l8f413rj15w",
      "requestId": "cmvzb3kvdch2l7l8fcg6zi9ha",
      "platformId": "salesforce",
      "eventType": "recording.ready",
      "callId": "cmvzb3jasch1e7l8fgp4zf6s4",
      "calleeName": "Unknown",
      "attempt": 1,
      "status": "delivered",
      "httpStatus": 201,
      "durationMs": 1076,
      "at": "2026-11-02T13:40:21.486Z",
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "payloadPreview": "{\n  \"event\": \"recording.ready\",\n  \"hasRecording\": true,\n  \"call\": {\n    \"id\": \"cmvzb3jasch1e7l8fgp4zf6s4\",\n    \"agentName\": \"Person 1\",\n    \"agentNumber\": \"+910000000003\",\n    \"calleeName\": \"Unknown\",\n    \"calleePhone\": \"+910000000010\",\n   …",
      "responsePreview": "{\n  \"salesTaskId\": \"a0D000000000000004\",\n  \"activityId\": \"00T000000000000005\",\n  \"opportunityId\": \"006000000000000006\",\n  \"success\": true\n}",
      "externalRecordId": "a0D000000000000004"
    },
    "… 18 more"
  ],
  "teamMembers": [],
  "dispositionSettings": {
    "enabled": true,
    "required": true,
    "promptTiming": "immediate",
    "allowSkip": false,
    "skipRequiresReason": true,
    "reminderIfIncomplete": true,
    "maxPromptSeconds": 0,
    "presetDispositions": [
      {
        "id": "interested",
        "label": "Interested",
        "enabled": true,
        "description": "Prospect showed buying intent"
      },
      {
        "id": "callback",
        "label": "Callback scheduled",
        "enabled": true,
        "description": "Follow-up time agreed on the call"
      },
      "… 5 more"
    ],
    "allowLicenseOverride": true
  },
  "callCaptureSettings": {
    "defaultPolicy": "default_business_allow_personal",
    "allowLicenseOverride": true,
    "recordingEnabled": true,
    "deleteLocalRecording": false
  },
  "mobileAppSettings": {
    "allowMobileLogout": true,
    "allowLicenseOverride": true
  },
  "dataRetentionSettings": {
    "preset": "day_1",
    "customDays": null
  },
  "storageSettings": {
    "mode": "trial_default",
    "clientStatus": "trial",
    "storageChoice": "default",
    "ownProvider": null,
    "provider": "platform_default",
    "status": "draft",
    "bucket": "",
    "region": "",
    "secretIdMasked": "",
    "roleArnMasked": "",
    "externalIdMasked": "",
    "kmsKeyId": "",
    "lastValidatedAt": null,
    "lastError": null,
    "migrationQueued": 0,
    "migrationDone": 0,
    "migrationFailed": 0,
    "callAnchorAccountId": "YOUR_CALL_ANCHOR_AWS_ACCOUNT_ID"
  },
  "trialRecordedCalls": 8,
  "trialPendingRecordings": 2,
  "trialRecordingLimit": 250,
  "trialPlatformSyncs": 17,
  "trialPlatformSyncLimit": 250,
  "trialRecordingAtLimit": false,
  "trialExpiresAt": "2026-11-16T00:00:00.000Z",
  "trialDaysRemaining": 14,
  "trialExpired": false,
  "contractRecordedCalls": 8,
  "contractPendingRecordings": 2,
  "contractRecordingLimit": 250,
  "contractRecordingUnlimited": false,
  "contractPlatformSyncs": 17,
  "contractSyncLimit": 250,
  "contractSyncUnlimited": false,
  "contractRecordingAtLimit": false,
  "contractLicenseCount": 5,
  "contractLicenseActiveCount": 5,
  "contractLicenseLimit": 5,
  "contractLicenseUnlimited": false,
  "contractLicenseAtLimit": true,
  "contractLicenseOverCap": false,
  "contractLicenseActivationLocked": false,
  "contractLicenseOverBy": 0,
  "contractSeatCompliancePhase": "compliant",
  "contractSeatGraceEndsAt": null,
  "contractSeatGracePeriodHours": 24,
  "contractIntegrationCount": 1,
  "contractIntegrationLimit": 2,
  "contractIntegrationUnlimited": false,
  "contractIntegrationAtLimit": false,
  "trialRecordingRetentionHeld": false,
  "trialRecordingDeletionDueAt": "2026-11-22T00:00:00.000Z",
  "trialRecordingAccessRevoked": false,
  "updatedAt": "2026-11-02T13:40:41.514Z"
}
```

</details>

### listClientIntegrations

Integration configs for a client. `GET /api/clients/{clientId}/integrations`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/integrations" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "configs": [
    {
      "platformId": "salesforce",
      "platformName": "Salesforce",
      "active": true,
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "authMode": "oauth2",
      "authFields": {
        "authorizationScheme": "Bearer",
        "clientId": "",
        "clientSecret": "",
        "grantType": "refresh_token",
        "tokenUrl": "https://login.salesforce.com/services/oauth2/token",
        "refreshToken": "",
        "accessToken": "",
        "instanceUrl": "https://acme.my.salesforce.com",
        "tokenIssuedAt": "1793624212006"
      },
      "authFieldMasks": {
        "clientId": "•••",
        "clientSecret": "•••",
        "refreshToken": "•••",
        "accessToken": "•••"
      },
      "isCustom": true,
      "scheduler": {
        "frequency": "realtime",
        "enabled": true
      },
      "eventTypes": [],
      "connectedAt": "2026-10-26",
      "lastHealthCheck": "2026-11-02T13:42:04.423Z"
    },
    {
      "platformId": "zoho",
      "platformName": "Zoho",
      "active": false,
      "endpoint": "https://hooks.callanchor.io/zoho",
      "authMode": "oauth2",
      "authFields": {},
      "isCustom": false,
      "scheduler": {
        "frequency": "1h",
        "enabled": true
      },
      "eventTypes": [],
      "lastHealthCheck": "2026-11-02T13:42:39.865Z"
    }
  ],
  "logs": []
}
```

</details>

### getDispositionFormFields

Disposition form for a client. `GET /api/clients/{clientId}/disposition-form-fields`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/disposition-form-fields" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "fields": [
    {
      "id": "cmvqbp2f44n6q7l8fj031fdt1",
      "slug": "project-name",
      "label": "Project Name",
      "type": "single_select",
      "required": false,
      "enabled": true,
      "isDefault": false,
      "sortOrder": 0,
      "config": {
        "options": [
          {
            "label": "ABHIMAAN HOMES",
            "value": "abhimaan-homes"
          },
          {
            "label": "Anarock Commercial",
            "value": "anarock-commercial"
          },
          "… 1 more"
        ]
      },
      "archivedAt": null,
      "usageCount": 154,
      "setMembershipCount": 1,
      "setNames": [
        "Org default"
      ]
    },
    {
      "id": "cmvpbtntg4hbr7l8fhvia1hev",
      "slug": "task-subject",
      "label": "Task Subject",
      "type": "single_select",
      "required": true,
      "enabled": true,
      "isDefault": false,
      "sortOrder": 1,
      "config": {
        "options": [
          {
            "label": "Virtual Meeting",
            "value": "virtual-meeting"
          },
          {
            "label": "Follow Up",
            "value": "follow-up"
          },
          "… 1 more"
        ]
      },
      "archivedAt": null,
      "usageCount": 154,
      "setMembershipCount": 1,
      "setNames": [
        "Org default"
      ]
    },
    "… 6 more"
  ],
  "presets": [
    {
      "id": "cmvp1b1fv43jt7l8fqhuu5r1y",
      "slug": "interested",
      "label": "Interested",
      "description": "Prospect showed buying intent",
      "enabled": true,
      "isDefault": true,
      "sortOrder": 0
    },
    {
      "id": "cmvp1b1fv43ju7l8fx6muwoel",
      "slug": "callback",
      "label": "Callback scheduled",
      "description": "Follow-up time agreed on the call",
      "enabled": true,
      "isDefault": true,
      "sortOrder": 1
    },
    "… 5 more"
  ]
}
```

</details>

### getOnboardingProgress

Onboarding steps a client has completed. `GET /api/clients/{clientId}/onboarding-progress`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/onboarding-progress" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "steps": [
    {
      "stepKey": "mobile_login",
      "completedAt": "2026-10-23T06:52:09.899Z"
    },
    {
      "stepKey": "first_call",
      "completedAt": "2026-10-23T06:56:46.861Z"
    },
    "… 1 more"
  ],
  "welcomeDismissed": false,
  "portalTourCompleted": false,
  "termsAcceptedAt": null
}
```

</details>

### listPortalAdmins

A client's customer-portal admins. `GET /api/clients/{clientId}/portal-admins`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/portal-admins" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "admins": [
    {
      "portalUserId": "cmuvbsy3d0ii9bmk6w5qu044i",
      "teamMemberId": "cmuvbsy3i0iibbmk6nbzn6ihg",
      "name": "Person 53",
      "email": "user53@example.test",
      "mobile": "+910000009002",
      "licenseNumber": null,
      "isActive": true,
      "lastLoginAt": null,
      "createdAt": "2026-10-05T14:09:17.977Z"
    },
    {
      "portalUserId": "cmuzm44sk0q6b8tpxnycdngly",
      "teamMemberId": "cmuzm44sp0q6d8tpxposla2ip",
      "name": "Person 54",
      "email": "user54@example.test",
      "mobile": "+910000009003",
      "licenseNumber": null,
      "isActive": true,
      "lastLoginAt": "2026-11-04T11:25:39.860Z",
      "createdAt": "2026-10-08T14:09:00.741Z"
    }
  ]
}
```

</details>

### listNotifications

A client's portal notifications. `GET /api/clients/{clientId}/notifications`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/notifications?page=1&limit=50" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "notifications": [],
  "unreadCount": 0,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0,
    "hasMore": false
  }
}
```

</details>

### getAiCredits

AI credit balance, entitlements and purchase history. `GET /api/clients/{clientId}/ai-credits`. Safety: read. Checked live on 2026-11-05.

Optional query: `from`, `to`, `cursor`.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/ai-credits" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "balance": 0,
  "purchasedCredits": 0,
  "creditsUsed": 0,
  "usagePercent": null,
  "allotmentEpoch": 1,
  "overdrawnBy": 0,
  "licenses": [],
  "entitlements": {
    "aiInsightsOptIn": false,
    "accountStatus": "purchased",
    "isTrial": false,
    "aiAllowed": false
  },
  "purchaseChanges": [],
  "purchaseChangesNextCursor": null
}
```

</details>

### listDispositionSets

Disposition form sets, with field and license counts. `GET /api/clients/{clientId}/disposition-sets`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/disposition-sets" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "sets": [
    {
      "id": "c4771f8d3aee42c891631d98fe442a20",
      "name": "Org default",
      "tag": null,
      "isDefault": true,
      "sortOrder": 0,
      "activeFieldCount": 2,
      "licenseCount": 0,
      "createdAt": "2026-11-03T17:39:35.770Z",
      "updatedAt": "2026-11-03T17:39:35.770Z"
    }
  ]
}
```

</details>

## Calls

### listCallContacts

Calls grouped by contact, with call stats. `GET /api/clients/{clientId}/call-contacts`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/call-contacts?page=1&limit=50" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "items": [
    {
      "calleeId": "phone-0000000008",
      "calleeName": "Unknown",
      "calleePhone": "+910000000008",
      "callCount": 1,
      "lastAgent": "Person 1",
      "lastDuration": "00:33",
      "lastDatetimeLabel": "2 Nov 2026 · 06:40 pm",
      "lastDatetime": "2026-11-02T13:10:40.423Z",
      "typesPresent": [
        "Outgoing"
      ],
      "latestAiInsightStatus": null,
      "latestAiInsightErrorCode": null,
      "latestAiOverallSentiment": null,
      "latestAiCreditsUsed": null
    },
    {
      "calleeId": "phone-0000000025",
      "calleeName": "Unknown",
      "calleePhone": "+910000000025",
      "callCount": 1,
      "lastAgent": "Person 1",
      "lastDuration": "05:45",
      "lastDatetimeLabel": "2 Nov 2026 · 06:34 pm",
      "lastDatetime": "2026-11-02T13:04:23.115Z",
      "typesPresent": [
        "Incoming"
      ],
      "latestAiInsightStatus": null,
      "latestAiInsightErrorCode": null,
      "latestAiOverallSentiment": null,
      "latestAiCreditsUsed": null
    },
    "… 8 more"
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 124,
    "totalPages": 13,
    "hasMore": true
  },
  "stats": {
    "totalCalls": 155,
    "uniqueContacts": 124,
    "incoming": 15,
    "outgoing": 133,
    "missed": 7,
    "rejected": 0,
    "answerRate": 95,
    "missedRate": 5,
    "rejectedRate": 0
  },
  "agents": [
    "Person 8",
    "Person 10",
    "… 4 more"
  ]
}
```

</details>

### getRecordingLink

Issue a signed link to a call recording. `GET /api/clients/{clientId}/calls/{callId}/recording-link`. Safety: sensitive. From a saved sample, not checked live.

> Issues a real recording link, valid for 5 minutes. Run it only when asked, and never log the link.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/calls/$CALL_ID/recording-link" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "callId": "cmvzbekinciv37l8fvzx1y6e0",
  "recordingStatus": "synced",
  "url": "https://recordings.example.test/file.m4a?X-Amz-Signature=REDACTED",
  "expiresAt": "2026-11-02T13:54:31.739Z"
}
```

</details>

### getCallee

One contact with call stats and every call to or from them. `GET /api/clients/{clientId}/callees/{calleeId}`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/callees/$CALLEE_ID" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "profile": {
    "id": "phone-0000009004",
    "name": "Person 55",
    "phone": "+910000009004",
    "stats": {
      "total": 1,
      "incoming": 0,
      "missed": 0,
      "outgoing": 1,
      "rejected": 0
    },
    "logs": [
      {
        "id": "cmvkma22v1aei7l8fmykwby0c",
        "time": "12:26 pm",
        "date": "2026-10-23",
        "dayLabel": "FRI",
        "type": "Outgoing",
        "agent": "Person 56",
        "duration": "00:05",
        "durationSeconds": 5,
        "recordingStatus": "synced",
        "platformSyncStatus": "synced",
        "recordingUnavailableReason": null,
        "recordingPermissionDisabledAt": null,
        "dispositionLabel": "Interested",
        "dispositionNote": null,
        "dispositionScheduledAt": null,
        "dispositionDisplayFields": [
          {
            "slug": "select-calling-agent",
            "label": "Select Calling Agent",
            "type": "single_select",
            "displayValue": "test-1"
          },
          {
            "slug": "outcome",
            "label": "Outcome",
            "type": "preset",
            "displayValue": "Interested"
          }
        ],
        "recordingSynced": false,
        "recordingDeleted": false,
        "recordingAvailable": false,
        "aiInsightStatus": null,
        "aiInsightErrorCode": null,
        "aiOverallSentiment": null,
        "aiSentimentScore": null,
        "aiCreditsUsed": null
      }
    ]
  }
}
```

</details>

### getCallAiInsights

A call's AI sentiment, summary and next actions. `GET /api/clients/{clientId}/calls/{callId}/ai-insights`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/calls/$CALL_ID/ai-insights" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "data": {
    "callRecordId": "cmvkma22v1aei7l8fmykwby0c",
    "status": "queued",
    "overallSentiment": null,
    "sentimentScore": null,
    "customerTone": null,
    "agentTone": null,
    "sentimentTimeline": [],
    "sentimentDrivers": [],
    "momSummary": null,
    "momKeyPoints": [],
    "nextActions": [],
    "languageCode": null,
    "errorCode": null,
    "errorMessage": null,
    "completedAt": null,
    "segments": [],
    "agentName": "Person 56",
    "calleeName": "Person 55",
    "calleePhone": "+910000009004",
    "durationLabel": "00:05",
    "startedAt": "2026-10-23T06:56:20.470Z",
    "missing": true
  }
}
```

</details>

## Sync

### listCalloutLogs

CRM delivery attempts, with success aggregate. `GET /api/clients/{clientId}/callout-logs`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/callout-logs?page=1&limit=50" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "items": [
    {
      "id": "cmvzbpwf0cjmj7l8f73937y36",
      "requestId": "cmvzbpwewcjmh7l8fy243yjmk",
      "platformId": "salesforce",
      "eventType": "recording.ready",
      "callId": "cmvzbpv0ccjkk7l8f20vo9j3m",
      "calleeName": "Unknown",
      "attempt": 1,
      "status": "delivered",
      "httpStatus": 201,
      "durationMs": 973,
      "at": "2026-11-02T13:57:42.876Z",
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "payloadPreview": "{\n  \"event\": \"recording.ready\",\n  \"hasRecording\": true,\n  \"call\": {\n    \"id\": \"cmvzbpv0ccjkk7l8f20vo9j3m\",\n    \"agentName\": \"Person 1\",\n    \"agentNumber\": \"+910000000003\",\n    \"calleeName\": \"Unknown\",\n    \"calleePhone\": \"+910000000039\",\n   …",
      "responsePreview": "{\n  \"salesTaskId\": \"a0D000000000000055\",\n  \"activityId\": \"00T000000000000056\",\n  \"opportunityId\": \"006000000000000057\",\n  \"success\": true\n}",
      "externalRecordId": "a0D000000000000055"
    },
    {
      "id": "cmvzbos88cjk37l8fsmg89ujf",
      "requestId": "cmvzbos85cjk17l8fszc7082q",
      "platformId": "salesforce",
      "eventType": "recording.ready",
      "callId": "cmvzboqkhcjis7l8fmkluleyh",
      "calleeName": "Unknown",
      "attempt": 1,
      "status": "delivered",
      "httpStatus": 201,
      "durationMs": 1251,
      "at": "2026-11-02T13:56:50.793Z",
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "payloadPreview": "{\n  \"event\": \"recording.ready\",\n  \"hasRecording\": true,\n  \"call\": {\n    \"id\": \"cmvzboqkhcjis7l8fmkluleyh\",\n    \"agentName\": \"Person 1\",\n    \"agentNumber\": \"+910000000003\",\n    \"calleeName\": \"Unknown\",\n    \"calleePhone\": \"+910000000040\",\n   …",
      "responsePreview": "{\n  \"salesTaskId\": \"a0D000000000000058\",\n  \"activityId\": \"00T000000000000059\",\n  \"opportunityId\": \"006000000000000060\",\n  \"success\": true\n}",
      "externalRecordId": "a0D000000000000058"
    },
    "… 8 more"
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 253,
    "totalPages": 26,
    "hasMore": true
  },
  "aggregate": {
    "total": 253,
    "delivered": 109,
    "failed": 144,
    "retrying": 0,
    "queued": 0,
    "successRate": 43,
    "avgDurationMs": 525
  }
}
```

</details>

### getAnchorLog

One delivery request with its attempts. `GET /api/clients/{clientId}/anchor-logs/{requestId}`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/anchor-logs/$REQUEST_ID" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "request": {
    "id": "cmvzbifjjcj4i7l8f1ech7djk",
    "status": "delivered",
    "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
    "payloadJson": {
      "call": {
        "id": "cmvzbiegfcj3o7l8fif9i8sfq",
        "callType": "Outgoing",
        "agentName": "Person 1",
        "startedAt": "2026-11-02T11:46:15.010Z",
        "calleeName": "Unknown",
        "agentNumber": "+910000000003",
        "calleePhone": "+910000000029",
        "recordingUrl": null,
        "dispositionNote": "<agent note>",
        "durationSeconds": 0,
        "dispositionLabel": null,
        "dispositionScheduledAt": "2026-11-03T04:30:00.000Z"
      },
      "event": "call.completed",
      "disposition": {
        "fields": {
          "note": "<agent note>",
          "priority": "high",
          "project-name": "acme-avantara",
          "scheduled-at": "2026-11-03T04:30:00.000Z",
          "task-subject": "follow-up",
          "next-action-status": "follow-up",
          "call-meeting-status": "not-connected"
        },
        "submittedAt": "2026-11-02T13:51:53.076Z"
      },
      "hasRecording": false
    },
    "attemptCount": 1,
    "eventType": "call_completed",
    "createdAt": "2026-11-02T13:51:54.415Z",
    "completedAt": "2026-11-02T13:51:54.414Z"
  },
  "events": [
    {
      "id": "cmvzbifjncj4k7l8f17vznwjn",
      "requestId": "cmvzbifjjcj4i7l8f1ech7djk",
      "platformId": "salesforce",
      "eventType": "call.completed",
      "callId": "cmvzbiegfcj3o7l8fif9i8sfq",
      "calleeName": "Unknown",
      "attempt": 1,
      "status": "delivered",
      "httpStatus": 201,
      "durationMs": 627,
      "at": "2026-11-02T13:51:54.419Z",
      "endpoint": "https://acme.my.salesforce.com/services/apexrest/CallAnchorWebhook",
      "payloadPreview": "{\n  \"event\": \"call.completed\",\n  \"hasRecording\": false,\n  \"call\": {\n    \"id\": \"cmvzbiegfcj3o7l8fif9i8sfq\",\n    \"agentName\": \"Person 1\",\n    \"agentNumber\": \"+910000000003\",\n    \"calleeName\": \"Unknown\",\n    \"calleePhone\": \"+910000000029\",\n   …",
      "responsePreview": "{\n  \"salesTaskId\": \"a0D000000000000052\",\n  \"activityId\": \"00T000000000000053\",\n  \"opportunityId\": \"006000000000000054\",\n  \"success\": true\n}",
      "externalRecordId": "a0D000000000000052"
    }
  ],
  "call": {
    "callRecordId": "cmvzbiegfcj3o7l8fif9i8sfq",
    "calleeId": "phone-0000000029",
    "calleeName": "Unknown",
    "calleePhone": "+910000000029",
    "agentName": "Person 1",
    "callType": "Outgoing",
    "durationLabel": "00:00",
    "callRecordAvailable": true
  },
  "platform": {
    "slug": "salesforce",
    "name": "Salesforce",
    "isCustom": true
  }
}
```

</details>

## OneAPI

### getOneApiStatus

Billing and licensing link status. `GET /api/clients/{clientId}/oneapi/status`. Safety: read. Checked live on 2026-11-02.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/oneapi/status" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "linked": true,
  "oneApiClientId": "6adf188fcdc09b4011badea5",
  "assignProductStatus": "completed",
  "cachedLicenseSeats": -1,
  "licenseSeatsFetchedAt": "2026-11-02T13:49:40.632Z",
  "cachedTrialExpiresAt": "2026-11-16T00:00:00.000Z",
  "licenseCount": 5,
  "accountStatus": "trial",
  "clientStatus": "trial",
  "backfillRecommended": false
}
```

</details>

### backfillOneApi

Refresh a client's OneAPI link and license data. `POST /api/clients/{clientId}/oneapi/backfill`. Safety: write. From a saved sample, not checked live.

> Changes production data. Run it only with the owner's approval.

```bash
curl -s -X POST "https://app.360callanchor.com/api/clients/$CLIENT_ID/oneapi/backfill" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{}'
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "action": "refreshed",
  "clientId": "cmvp1b1fu43jk7l8f88qbvkov",
  "oneApiClientId": "6adf188fcdc09b4011badea5",
  "assignProductStatus": "completed",
  "assignSucceeded": true,
  "licenseSeats": -1,
  "licenseCount": 5
}
```

</details>

## Logs

### listSystemLogs

System logs, optionally for one client. `GET /api/support/logs`. Safety: read. Checked live on 2026-11-02.

Optional query: `clientId`.

```bash
curl -s "https://app.360callanchor.com/api/support/logs?page=1&limit=50" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "items": [
    {
      "id": "cmvzb7bp9chd67l8f0i1a0ial",
      "occurredAt": "2026-11-02T13:43:16.221Z",
      "category": "mobile",
      "severity": "info",
      "source": "mobile.recording.upload-init",
      "clientId": "cmt1mg1rf00v9caa5hlyidcvb",
      "actorType": "mobile",
      "actorId": "cmu1b7jge2ggmewwgk4a1xzw1",
      "actorEmail": null,
      "correlationId": "dedff484-667d-4baf-a7b9-f2b3d8b2aa11",
      "resourceType": "call_record",
      "resourceId": "cmvzb7beochcs7l8fbd9svwlm",
      "httpMethod": null,
      "httpPath": null,
      "httpStatus": null,
      "durationMs": null,
      "message": "Recording upload session initialized",
      "metadata": {
        "s3Key": "client/cmt1mg1rf00v9caa5hlyidcvb/team/cmu1b7jgb2ggkewwgbgyah8ip/call/cmvzb7beochcs7l8fbd9svwlm/1793626996155-1cabd951.mp3",
        "fileSizeBytes": 334176,
        "uploadSessionId": "ddf1f0b4-61f4-49ff-a69e-74bfba72ed93"
      },
      "ipAddress": "203.0.113.1"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 14629,
    "totalPages": 293,
    "hasMore": true
  }
}
```

</details>

### listAuditLogs

Audit logs, optionally for one client. `GET /api/support/audit-logs`. Safety: read. Checked live on 2026-11-02.

Optional query: `clientId`.

```bash
curl -s "https://app.360callanchor.com/api/support/audit-logs?page=1&limit=50" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "items": [
    {
      "id": "cmvz9uv29cezh7l8f5jgukrjk",
      "clientId": "cmvp1b1fu43jk7l8f88qbvkov",
      "actorUserId": "cmv7oet8a41au11mm8r3llkmf",
      "actorEmail": "user8@example.test",
      "actorType": "support",
      "actorDisplayName": "Person 25",
      "action": "sync",
      "resourceType": "integration",
      "resourceId": "cmvp1b1fu43jk7l8f88qbvkov",
      "correlationId": "7f5ec7fd-76dc-41ca-96dc-60305fe139d4",
      "metadata": {
        "event": "manual_sync_all",
        "totals": {
          "failed": 19,
          "synced": 0,
          "blocked": 0,
          "processed": 19
        },
        "platforms": [
          "salesforce"
        ]
      },
      "ipAddress": "203.0.113.3",
      "occurredAt": "2026-11-02T13:05:35.169Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 79,
    "totalPages": 2,
    "hasMore": true
  }
}
```

</details>

### getAuditLog

One audit log entry. `GET /api/support/audit-logs/{auditLogId}`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/support/audit-logs/$AUDIT_LOG_ID" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "id": "cmw2162e12n18gem6a3y5mhkm",
  "clientId": "cmus74leshej2ewwgii5qaycf",
  "actorUserId": "cmuzm44sk0q6b8tpxnycdngly",
  "actorEmail": "user54@example.test",
  "actorType": null,
  "actorDisplayName": null,
  "action": "login",
  "resourceType": "portal_user",
  "resourceId": "cmuzm44sk0q6b8tpxnycdngly",
  "correlationId": null,
  "metadata": null,
  "ipAddress": null,
  "occurredAt": "2026-11-04T11:25:39.865Z"
}
```

</details>

## App

### getLatestAppBuild

The active Android app release. `GET /api/app-build/latest`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/app-build/latest" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "release": {
    "id": "cmtv7z3s907zvewwgn4ger641",
    "version": "1.0.6",
    "downloadUrl": "https://downloads.example.test/callanchor.apk",
    "qrImageUrl": "https://downloads.example.test/callanchor-qr.png",
    "notes": null,
    "isActive": true,
    "createdAt": "2026-09-10T07:42:24.490Z",
    "uploadedBy": {
      "id": "cmrajg5ki001pct84lxmtpl6v",
      "email": "user52@example.test",
      "name": "Person 52"
    }
  }
}
```

</details>

## Licenses

### getLicenseSeatCompliance

Whether active licenses are within the contracted seat limit. `GET /api/clients/{clientId}/license-seat-compliance`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/license-seat-compliance" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "phase": "compliant",
  "total": 0,
  "activeCount": 0,
  "limit": 5,
  "overBy": 0,
  "overCap": false,
  "activationLocked": false,
  "seatGraceStartedAt": null,
  "seatGraceEndsAt": null,
  "seatGracePeriodHours": 24,
  "recommendations": []
}
```

</details>

### getLicenseSeatSettings

The grace period allowed when licenses exceed the seat limit. `GET /api/clients/{clientId}/license-seat-settings`. Safety: read. Checked live on 2026-11-05.

```bash
curl -s "https://app.360callanchor.com/api/clients/$CLIENT_ID/license-seat-settings" \
  -H "Cookie: callanchor_portal_session=$CALLANCHOR_SESSION"
```

<details><summary>Sample response (redacted)</summary>

```json
{
  "seatGracePeriodHours": 24,
  "seatGraceStartedAt": null,
  "seatGraceEndsAt": null,
  "minHours": 1,
  "maxHours": 168
}
```

</details>

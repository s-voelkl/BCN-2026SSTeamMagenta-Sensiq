#include <AUnit.h>
#include "WifiConnection.h"
#include "config.h"

test(WifiConnection_connectToWiFi_connectsToWiFiAndReturnsTrue)
{
    // Act: Call the connectToWiFi function
    bool result = connectToWiFi();

    // Assert: Verify that the connection got established successfully
    assertTrue(result);
}
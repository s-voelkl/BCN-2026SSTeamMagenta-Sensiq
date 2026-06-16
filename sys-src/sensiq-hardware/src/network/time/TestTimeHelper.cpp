#include "TimeHelper.h"
#include "../wifi/WifiConnection.h"

#include <time.h>
#include <WiFi.h>
#include <AUnit.h>

test(TimeHelper_TimeIsSynchronized)
{
    // Arrange: Ensure WiFi is connected before syncing time.
    if (WiFi.status() != WL_CONNECTED)
    {
        connectToWiFi();
    }

    // Act: Call the synchronization function
    syncTime();

    // Assert: Time should be greater than Jan 1, 2020 (1577836800 seconds since Unix epoch)
    time_t now = time(nullptr);
    assertTrue(now >= 1577836800);
}

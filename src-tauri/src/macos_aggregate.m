#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>

static NSString* get_device_uid(AudioObjectID deviceID) {
    AudioObjectPropertyAddress addr = {
        kAudioDevicePropertyDeviceUID,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    CFStringRef uid = NULL;
    UInt32 size = sizeof(CFStringRef);
    if (AudioObjectGetPropertyData(deviceID, &addr, 0, NULL, &size, &uid) == noErr) {
        return (__bridge_transfer NSString*)uid;
    }
    return nil;
}

static AudioObjectID find_device_by_name(NSString* targetName) {
    AudioObjectPropertyAddress addr = {
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    UInt32 size = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &addr, 0, NULL, &size) != noErr) {
        return kAudioObjectUnknown;
    }
    
    int count = size / sizeof(AudioObjectID);
    AudioObjectID* devices = malloc(size);
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, NULL, &size, devices) != noErr) {
        free(devices);
        return kAudioObjectUnknown;
    }
    
    AudioObjectID found = kAudioObjectUnknown;
    for (int i = 0; i < count; i++) {
        AudioObjectPropertyAddress nameAddr = {
            kAudioObjectPropertyName,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef name = NULL;
        UInt32 nameSize = sizeof(CFStringRef);
        if (AudioObjectGetPropertyData(devices[i], &nameAddr, 0, NULL, &nameSize, &name) == noErr) {
            NSString* nsName = (__bridge NSString*)name;
            if ([nsName localizedCaseInsensitiveContainsString:targetName]) {
                found = devices[i];
                CFRelease(name);
                break;
            }
            CFRelease(name);
        }
    }
    free(devices);
    return found;
}

static AudioObjectID get_default_output() {
    AudioObjectPropertyAddress addr = {
        kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    AudioObjectID devID = kAudioObjectUnknown;
    UInt32 size = sizeof(AudioObjectID);
    AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, NULL, &size, &devID);
    return devID;
}

void create_aggregate_device_c(const char* name) {
    if (!name) return;
    
    @autoreleasepool {
        NSString* nsName = [NSString stringWithUTF8String:name];
        AudioObjectID existing = find_device_by_name(nsName);
        if (existing != kAudioObjectUnknown) {
            return;
        }
        
        AudioObjectID blackholeID = find_device_by_name(@"BlackHole 2ch");
        if (blackholeID == kAudioObjectUnknown) {
             blackholeID = find_device_by_name(@"BlackHole 16ch");
        }
        
        AudioObjectID defaultOutID = get_default_output();
        
        if (blackholeID == kAudioObjectUnknown) {
             NSLog(@"BlackHole not found! Cannot create aggregate device.");
             return;
        }

        NSString* bhUID = get_device_uid(blackholeID);
        NSString* defaultOutUID = get_device_uid(defaultOutID);
        
        NSMutableArray *subDevices = [NSMutableArray array];
        // subdevices must be an array of NSString UIDs, not dictionaries!
        if (defaultOutUID) {
            [subDevices addObject:defaultOutUID];
        }
        if (bhUID) {
            [subDevices addObject:bhUID];
        }
        
        AudioObjectID pluginID = kAudioObjectUnknown;
        AudioObjectPropertyAddress pluginAddr = {
            'pibi', // kAudioHardwarePropertyPlugInForBundleID
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef bundleID = CFSTR("com.apple.audio.CoreAudio");
        UInt32 outSize = sizeof(AudioObjectID);
        AudioValueTranslation translation = {
            &bundleID, sizeof(bundleID),
            &pluginID, outSize
        };
        
        UInt32 transSize = sizeof(AudioValueTranslation);
        if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &pluginAddr, 0, NULL, &transSize, &translation) != noErr) {
            NSLog(@"Failed to get plugin ID");
            return;
        }
        
        NSDictionary *dict = @{
            @"name": nsName,
            @"uid": [NSString stringWithFormat:@"%@_UID_%d", nsName, (int)[[NSDate date] timeIntervalSince1970]],
            @"subdevices": subDevices,
            @"master": (defaultOutUID ? defaultOutUID : bhUID)
        };
        
        AudioObjectPropertyAddress createAddr = {
            kAudioPlugInCreateAggregateDevice,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        UInt32 dictSize = sizeof(CFDictionaryRef);
        OSStatus err = AudioObjectSetPropertyData(pluginID, &createAddr, 0, NULL, dictSize, &dict);
        if (err != noErr) {
            NSLog(@"Failed to create aggregate device: %d", err);
        }
    }
}

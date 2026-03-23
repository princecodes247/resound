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

static AudioObjectID find_builtin_device(BOOL isInput) {
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
        AudioObjectPropertyAddress transportAddr = {
            kAudioDevicePropertyTransportType,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        UInt32 transportType = 0;
        UInt32 ttSize = sizeof(UInt32);
        if (AudioObjectGetPropertyData(devices[i], &transportAddr, 0, NULL, &ttSize, &transportType) == noErr) {
            if (transportType == 'bltn') {
                AudioObjectPropertyAddress streamAddr = {
                    kAudioDevicePropertyStreams,
                    isInput ? kAudioDevicePropertyScopeInput : kAudioDevicePropertyScopeOutput,
                    kAudioObjectPropertyElementMain
                };
                UInt32 streamSize = 0;
                AudioObjectGetPropertyDataSize(devices[i], &streamAddr, 0, NULL, &streamSize);
                if (streamSize > 0) {
                    found = devices[i];
                    break;
                }
            }
        }
    }
    free(devices);
    return found;
}

void create_aggregate_device_c(const char* name) {
    if (!name) return;
    
    @autoreleasepool {
        NSString* nsName = [NSString stringWithUTF8String:name];
        AudioObjectID existing = find_device_by_name(nsName);
        if (existing != kAudioObjectUnknown) {
            return;
        }
        
        AudioObjectID defaultOutID = find_builtin_device(NO);
        AudioObjectID defaultInID = find_builtin_device(YES);

        NSString* defaultOutUID = get_device_uid(defaultOutID);
        NSString* defaultInUID = get_device_uid(defaultInID);
        
        NSMutableArray *subDevices = [NSMutableArray array];
        NSMutableSet *addedUIDs = [NSMutableSet set];
        
        if (defaultInUID && ![addedUIDs containsObject:defaultInUID]) {
            [subDevices addObject:@{ @"uid": defaultInUID }];
            [addedUIDs addObject:defaultInUID];
        }
        if (defaultOutUID && ![addedUIDs containsObject:defaultOutUID]) {
            [subDevices addObject:@{ @"uid": defaultOutUID }];
            [addedUIDs addObject:defaultOutUID];
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
        
        NSString *masterUID = defaultOutUID ? defaultOutUID : (defaultInUID ? defaultInUID : @"");
        NSDictionary *dict = @{
            @"name": nsName,
            @"uid": [NSString stringWithFormat:@"%@_UID_%d", nsName, (int)[[NSDate date] timeIntervalSince1970]],
            @"subdevices": subDevices,
            @"master": masterUID
        };
        
        AudioObjectPropertyAddress createAddr = {
            kAudioPlugInCreateAggregateDevice,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        UInt32 qualSize = sizeof(CFDictionaryRef);
        UInt32 aggOutSize = sizeof(AudioObjectID);
        AudioObjectID newDeviceID = kAudioObjectUnknown;
        OSStatus err = AudioObjectGetPropertyData(pluginID, &createAddr, qualSize, &dict, &aggOutSize, &newDeviceID);
        if (err != noErr) {
            NSLog(@"Failed to create aggregate device: %d", err);
        } else {
            NSLog(@"Successfully created aggregate device with ID: %u", newDeviceID);
        }
    }
}

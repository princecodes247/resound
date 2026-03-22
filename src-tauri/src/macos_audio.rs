#[cfg(target_os = "macos")]
use coreaudio_sys::{
    AudioDeviceID,
    AudioObjectPropertyAddress,
    kAudioHardwarePropertyDevices,
    kAudioHardwarePropertyDefaultInputDevice,
    kAudioHardwarePropertyDefaultOutputDevice,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMaster,
    kAudioObjectPropertyName,
    AudioObjectGetPropertyDataSize,
    AudioObjectGetPropertyData,
    AudioObjectSetPropertyData,
};
#[cfg(target_os = "macos")]
use core_foundation_sys::string::{CFStringRef, CFStringGetCString};
#[cfg(target_os = "macos")]
use core_foundation_sys::base::CFRelease;
#[cfg(target_os = "macos")]
use std::ptr;

#[cfg(target_os = "macos")]
const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

#[cfg(target_os = "macos")]
pub fn get_default_device(is_input: bool) -> Result<String, String> {
    let mut device_id: AudioDeviceID = 0;
    let mut size = std::mem::size_of::<AudioDeviceID>() as u32;
    let selector = if is_input {
        kAudioHardwarePropertyDefaultInputDevice
    } else {
        kAudioHardwarePropertyDefaultOutputDevice
    };

    let address = AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMaster,
    };

    let status = unsafe {
        AudioObjectGetPropertyData(
            coreaudio_sys::kAudioObjectSystemObject,
            &address,
            0,
            ptr::null(),
            &mut size,
            &mut device_id as *mut _ as *mut _,
        )
    };

    if status != 0 {
        return Err(format!("Failed to get default device ID. OSStatus: {}", status));
    }

    get_device_name(device_id)
}

#[cfg(target_os = "macos")]
pub fn set_default_device(is_input: bool, target_name: &str) -> Result<(), String> {
    let devices = get_all_devices()?;
    for id in devices {
        if let Ok(name) = get_device_name(id) {
            if name.to_lowercase().contains(&target_name.to_lowercase()) {
                let size = std::mem::size_of::<AudioDeviceID>() as u32;
                let selector = if is_input {
                    kAudioHardwarePropertyDefaultInputDevice
                } else {
                    kAudioHardwarePropertyDefaultOutputDevice
                };

                let address = AudioObjectPropertyAddress {
                    mSelector: selector,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMaster,
                };

                let mut device_id = id;

                let status = unsafe {
                    AudioObjectSetPropertyData(
                        coreaudio_sys::kAudioObjectSystemObject,
                        &address,
                        0,
                        ptr::null(),
                        size,
                        &mut device_id as *mut _ as *const _,
                    )
                };

                if status != 0 {
                    return Err(format!("Failed to set default device. OSStatus: {}", status));
                }
                return Ok(());
            }
        }
    }
    Err(format!("Device not found: {}", target_name))
}

#[cfg(target_os = "macos")]
fn get_all_devices() -> Result<Vec<AudioDeviceID>, String> {
    let address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMaster,
    };

    let mut size: u32 = 0;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            coreaudio_sys::kAudioObjectSystemObject,
            &address,
            0,
            ptr::null(),
            &mut size,
        )
    };

    if status != 0 {
        return Err(format!("Failed to get devices size. OSStatus: {}", status));
    }

    let count = size as usize / std::mem::size_of::<AudioDeviceID>();
    let mut devices = vec![0 as AudioDeviceID; count];

    let status = unsafe {
        AudioObjectGetPropertyData(
            coreaudio_sys::kAudioObjectSystemObject,
            &address,
            0,
            ptr::null(),
            &mut size,
            devices.as_mut_ptr() as *mut _,
        )
    };

    if status != 0 {
        return Err(format!("Failed to get devices logic. OSStatus: {}", status));
    }
    
    Ok(devices)
}

#[cfg(target_os = "macos")]
fn get_device_name(id: AudioDeviceID) -> Result<String, String> {
    let address = AudioObjectPropertyAddress {
        mSelector: kAudioObjectPropertyName,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMaster,
    };

    let mut name_cf: CFStringRef = ptr::null();
    let mut size = std::mem::size_of::<CFStringRef>() as u32;

    let status = unsafe {
        AudioObjectGetPropertyData(
            id,
            &address,
            0,
            ptr::null(),
            &mut size,
            &mut name_cf as *mut _ as *mut _,
        )
    };

    if status != 0 || name_cf.is_null() {
        return Err(format!("Failed to get name format for id {}", id));
    }

    unsafe {
        let mut buffer = [0u8; 256];
        if CFStringGetCString(
            name_cf, 
            buffer.as_mut_ptr() as *mut i8, 
            256, 
            K_CF_STRING_ENCODING_UTF8
        ) != 0 {
            let cstr = std::ffi::CStr::from_ptr(buffer.as_ptr() as *const i8);
            if let Ok(s) = cstr.to_str() {
                CFRelease(name_cf as _);
                return Ok(s.to_string());
            }
        }
        CFRelease(name_cf as _);
        Err("Could not parse string".into())
    }
}

#[cfg(not(target_os = "macos"))]
pub fn get_default_device(is_input: bool) -> Result<String, String> {
    Err("Not implemented for this OS".into())
}

#[cfg(not(target_os = "macos"))]
pub fn set_default_device(is_input: bool, target_name: &str) -> Result<(), String> {
    Err("Not implemented for this OS".into())
}

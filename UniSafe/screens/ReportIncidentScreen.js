import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { controls, radius, spacing, typography } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { triageDescription, URGENCY_META } from '../src/utils/aiTriage';
import { checkDuplicate } from '../src/utils/duplicateDetector';
import { api } from '../src/utils/api';
import { INCIDENT_CATEGORIES, getIncidentCategory } from '../src/data/incidentTypes';

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 512;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const INITIAL_FORM = {
  category: '',
  incidentType: '',
  description: '',
  location: null,
  locationText: '',
  photos: [],
  reportingPreference: '',
};

function DropdownModal({ visible, title, options, selected, colors, onSelect, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.modalScrim, { backgroundColor: colors.modalScrim }]}>
        <View style={[styles.dropdownModal, { backgroundColor: colors.surfaceCard }]}>
          <View style={styles.modalHeading}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close options"
              style={styles.iconButton}
            >
              <MaterialIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(option => {
              const active = option.value === selected;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.dropdownOption, { borderBottomColor: colors.border }]}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  activeOpacity={0.75}
                >
                  {!!option.icon && <MaterialIcons name={option.icon} size={22} color={option.color} />}
                  <Text style={[styles.dropdownOptionText, { color: colors.textPrimary }]}>{option.label}</Text>
                  {active && <MaterialIcons name="check" size={21} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FieldError({ children }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <Text accessibilityRole="alert" style={[styles.fieldError, { color: colors.sos }]}>{children}</Text>;
}

function FormLabel({ children, colors }) {
  return <Text style={[styles.label, { color: colors.textPrimary }]}>{children}</Text>;
}

function SelectButton({ label, placeholder, icon, color, colors, onPress, accessibilityLabel }) {
  return (
    <TouchableOpacity
      style={[styles.selectButton, { borderColor: colors.border, backgroundColor: colors.surfaceCard }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: false }}
      activeOpacity={0.75}
    >
      {icon && <MaterialIcons name={icon} size={21} color={color || colors.textMuted} />}
      <Text style={[styles.selectText, { color: label ? colors.textPrimary : colors.textMuted }]} numberOfLines={2}>
        {label || placeholder}
      </Text>
      <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ReportIncidentScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [openDropdown, setOpenDropdown] = useState('');
  const [gpsState, setGpsState] = useState('idle');
  const [gpsError, setGpsError] = useState('');
  const [triage, setTriage] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [profile, setProfile] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const submittingRef = useRef(false);

  const category = getIncidentCategory(form.category);
  const typeOptions = category
    ? category.types.map(type => ({ value: type, label: type }))
    : [];

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('user')
      .then(value => {
        if (active && value) setProfile(JSON.parse(value));
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const suggestion = triageDescription(form.description);
    setTriage(suggestion);
    setDuplicate(
      form.category && form.description.trim().length >= 10
        ? checkDuplicate(form.description, form.category)
        : null,
    );
  }, [form.category, form.description]);

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: '' }));
  }

  function selectCategory(value) {
    setForm(current => ({ ...current, category: value, incidentType: '' }));
    setErrors(current => ({ ...current, category: '', incidentType: '' }));
    setOpenDropdown('');
  }

  function validate() {
    const nextErrors = {};
    if (!form.category) nextErrors.category = 'Select an incident category.';
    if (!form.incidentType) nextErrors.incidentType = 'Select the type of incident.';
    if (!form.description.trim()) nextErrors.description = 'Describe what happened.';
    if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
    }
    if (!form.locationText.trim()) nextErrors.locationText = 'Enter a campus location description.';
    if (form.locationText.length > MAX_LOCATION_LENGTH) {
      nextErrors.locationText = `Use ${MAX_LOCATION_LENGTH} characters or fewer.`;
    }
    if (!form.reportingPreference) nextErrors.reportingPreference = 'Choose a reporting preference.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function captureLocation() {
    setGpsState('loading');
    setGpsError('');
    try {
      const Location = await import('expo-location');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setGpsState('error');
        setGpsError('Location permission was not granted. You can continue by entering the incident location below.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setForm(current => ({
        ...current,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      }));
      setGpsState('success');
    } catch {
      setGpsState('error');
      setGpsError('Could not get the current GPS position. You can continue by entering the incident location below.');
    }
  }

  async function choosePhotos(source) {
    if (form.photos.length >= MAX_IMAGES) {
      Alert.alert('Photo limit reached', `You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Camera permission needed', 'Allow camera access to take an incident photo, or choose an image from your gallery.');
          return;
        }
      }

      const pickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        exif: false,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync({
          ...pickerOptions,
          allowsMultipleSelection: true,
          selectionLimit: MAX_IMAGES - form.photos.length,
        });
      if (result.canceled) return;

      const selected = (result.assets || []).slice(0, MAX_IMAGES - form.photos.length);
      const accepted = [];
      for (const [index, asset] of selected.entries()) {
        const name = asset.fileName || asset.uri.split(/[\\/]/).pop() || `evidence-${Date.now()}-${index}`;
        const extension = name.split('.').pop()?.toLowerCase();
        const mimeType = asset.mimeType || (extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : '');
        if (!['image/jpeg', 'image/png'].includes(mimeType)) {
          Alert.alert('Unsupported image', 'Choose a JPEG or PNG image. Other image formats are not uploaded.');
          continue;
        }
        if (asset.fileSize > MAX_IMAGE_BYTES) {
          Alert.alert('Image is too large', 'Each image must be 2 MB or smaller. Choose a smaller image or retake it.');
          continue;
        }
        accepted.push({
          uri: asset.uri,
          name: `incident-evidence-${Date.now()}-${index}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
          type: mimeType,
          fileSize: asset.fileSize,
        });
      }
      if (accepted.length) {
        setForm(current => ({ ...current, photos: [...current.photos, ...accepted].slice(0, MAX_IMAGES) }));
      }
    } catch {
      Alert.alert('Photo unavailable', 'The photo could not be selected. Your report form is unchanged.');
    }
  }

  function confirmSubmit() {
    if (submittingRef.current || !validate()) return;
    setConfirmVisible(true);
  }

  async function submitReport() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmVisible(false);
    try {
      const result = await api.submitIncident({
        category: form.category,
        incidentType: form.incidentType,
        description: form.description.trim(),
        latitude: form.location?.latitude,
        longitude: form.location?.longitude,
        locationText: form.locationText.trim(),
        priority: triage?.urgency || 'Medium',
        confidentialToResponders: form.reportingPreference === 'confidential',
        photos: form.photos,
      });
      if (!result?.id) throw new Error('The server did not confirm receipt of this report.');
      setSubmittedId(result.id);
    } catch (error) {
      Alert.alert(
        'Report not confirmed',
        `${error.message || 'The server could not receive the report.'} Your entries are still here. Check My Reports before trying again to avoid creating a duplicate.`,
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function removePhoto(index) {
    setForm(current => ({ ...current, photos: current.photos.filter((_, photoIndex) => photoIndex !== index) }));
  }

  if (submittedId) {
    return (
      <View style={[styles.successScreen, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <MaterialIcons name="check-circle" size={68} color={colors.ambulance} />
        <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Report submitted</Text>
        <Text style={[styles.successText, { color: colors.textSecondary }]}>
          Campus authorities have received your report. Keep this reference number to follow its status.
        </Text>
        <Text selectable style={[styles.reference, { color: colors.primary, backgroundColor: colors.surfaceAlt }]}>{submittedId}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('MyReports')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>View My Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Home')}>
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, backgroundColor: colors.surfaceCard, color: colors.textPrimary },
  ];
  const emergency = form.category === 'Fire' || form.category === 'Ambulance';

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 18 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: colors.primary }]}>Report an Incident</Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Select the type of incident and provide the information needed to help campus authorities respond.
        </Text>

        <FormLabel colors={colors}>Incident Category *</FormLabel>
        <SelectButton
          label={category?.label}
          placeholder="Select incident category"
          icon={category?.icon}
          color={category?.color}
          colors={colors}
          onPress={() => setOpenDropdown('category')}
          accessibilityLabel="Select incident category"
        />
        <FieldError>{errors.category}</FieldError>

        {!!category && (
          <>
            <FormLabel colors={colors}>Type of Incident *</FormLabel>
            <SelectButton
              label={form.incidentType}
              placeholder="Select incident type"
              colors={colors}
              onPress={() => setOpenDropdown('type')}
              accessibilityLabel="Select type of incident"
            />
            <FieldError>{errors.incidentType}</FieldError>

            {!!form.incidentType && (
              <>
                <FormLabel colors={colors}>Incident Description *</FormLabel>
                <TextInput
                  style={[...inputStyle, styles.descriptionInput]}
                  value={form.description}
                  onChangeText={value => updateForm('description', value.slice(0, MAX_DESCRIPTION_LENGTH))}
                  placeholder="Describe what happened, when it happened, who or what was involved, and any immediate danger."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  textAlignVertical="top"
                  accessibilityLabel="Incident description"
                />
                <Text style={[styles.counter, { color: colors.textMuted }]}>
                  {form.description.length}/{MAX_DESCRIPTION_LENGTH}
                </Text>
                <FieldError>{errors.description}</FieldError>
                {triage && (
                  <View style={[styles.suggestion, { borderColor: URGENCY_META[triage.urgency].border, backgroundColor: URGENCY_META[triage.urgency].bg }]}>
                    <Text style={[styles.suggestionText, { color: URGENCY_META[triage.urgency].color }]}>
                      Suggested urgency: {triage.urgency}. You can change this later with campus responders.
                    </Text>
                  </View>
                )}
                {duplicate && (
                  <View style={[styles.duplicateNotice, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                    <MaterialIcons name="info-outline" size={18} color={colors.fire} />
                    <Text style={[styles.duplicateText, { color: colors.textSecondary }]}>
                      This description may be similar to another recent report. You can still submit if it describes a separate incident.
                    </Text>
                  </View>
                )}

                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Incident Location</Text>
                <FormLabel colors={colors}>GPS Location</FormLabel>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>
                  This is the reporting device’s current position, which may differ from where the incident happened. Location is requested only when you tap the button.
                </Text>
                <TouchableOpacity
                  style={[styles.gpsButton, { backgroundColor: colors.primary }, gpsState === 'loading' && styles.buttonDisabled]}
                  onPress={captureLocation}
                  disabled={gpsState === 'loading'}
                  accessibilityRole="button"
                >
                  {gpsState === 'loading'
                    ? <ActivityIndicator color="#fff" />
                    : <MaterialIcons name="my-location" size={20} color="#fff" />}
                  <Text style={styles.gpsButtonText}>{form.location ? 'Refresh GPS Location' : 'Get Current Location'}</Text>
                </TouchableOpacity>
                {!!gpsError && <FieldError>{gpsError}</FieldError>}
                {!!form.location && (
                  <View style={[styles.gpsResult, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
                    <MaterialIcons name="location-on" size={19} color={colors.ambulance} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.gpsResultTitle, { color: colors.textPrimary }]}>Reporting device location</Text>
                      <Text style={[styles.gpsCoordinates, { color: colors.textSecondary }]}>
                        {form.location.latitude.toFixed(6)}, {form.location.longitude.toFixed(6)}
                      </Text>
                      {Number.isFinite(form.location.accuracy) && (
                        <Text style={[styles.gpsAccuracy, { color: colors.textMuted }]}>Accuracy ±{Math.round(form.location.accuracy)} m</Text>
                      )}
                    </View>
                  </View>
                )}
                <FormLabel colors={colors}>Location Description *</FormLabel>
                <TextInput
                  style={inputStyle}
                  value={form.locationText}
                  onChangeText={value => updateForm('locationText', value.slice(0, MAX_LOCATION_LENGTH))}
                  placeholder="Example: DODL Hall, Block B, second floor, near the staircase."
                  placeholderTextColor={colors.textMuted}
                  maxLength={MAX_LOCATION_LENGTH}
                  accessibilityLabel="Incident location description"
                />
                <FieldError>{errors.locationText}</FieldError>

                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Photo Evidence (Optional)</Text>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>
                  Add up to 3 JPEG or PNG images. Each image must be 2 MB or smaller. Photos are stored with this report in UniSafe’s PostgreSQL database.
                </Text>
                <View style={[styles.photoActions, width < 380 && styles.photoActionsNarrow]}>
                  <TouchableOpacity
                    style={[styles.photoAction, { borderColor: colors.border, backgroundColor: colors.surfaceCard }]}
                    onPress={() => choosePhotos('camera')}
                    disabled={form.photos.length >= MAX_IMAGES}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="photo-camera" size={21} color={colors.primary} />
                    <Text style={[styles.photoActionText, { color: colors.textPrimary }]}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoAction, { borderColor: colors.border, backgroundColor: colors.surfaceCard }]}
                    onPress={() => choosePhotos('gallery')}
                    disabled={form.photos.length >= MAX_IMAGES}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name="photo-library" size={21} color={colors.primary} />
                    <Text style={[styles.photoActionText, { color: colors.textPrimary }]}>Choose from Gallery</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.photoGrid}>
                  {form.photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.photoPreview}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} accessibilityLabel="Selected incident photo" />
                      <TouchableOpacity
                        style={[styles.photoRemove, { backgroundColor: colors.sos }]}
                        onPress={() => removePhoto(index)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove selected image"
                      >
                        <MaterialIcons name="close" size={19} color="#fff" />
                      </TouchableOpacity>
                      <Text numberOfLines={1} style={styles.photoSize}>
                        {photo.fileSize ? `${(photo.fileSize / 1024).toFixed(0)} KB` : photo.type.replace('image/', '').toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.helper, { color: colors.textMuted }]}>{form.photos.length}/{MAX_IMAGES} images selected</Text>

                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Reporting Preference *</Text>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>
                  Choose how your identity is presented to campus responders. Your signed-in account remains linked to the report for ownership and system audit.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.preferenceCard,
                    { borderColor: form.reportingPreference === 'confidential' ? colors.primary : colors.border, backgroundColor: colors.surfaceCard },
                  ]}
                  onPress={() => updateForm('reportingPreference', 'confidential')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: form.reportingPreference === 'confidential' }}
                >
                  <MaterialIcons
                    name={form.reportingPreference === 'confidential' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={23}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.preferenceTitle, { color: colors.textPrimary }]}>Confidential to responders</Text>
                    <Text style={[styles.preferenceDescription, { color: colors.textSecondary }]}>
                      Your identity is hidden from responders in incident views. Authorized administrators can still associate this report with your account through system records. This is not complete anonymity.
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.preferenceCard,
                    { borderColor: form.reportingPreference === 'identified' ? colors.primary : colors.border, backgroundColor: colors.surfaceCard },
                  ]}
                  onPress={() => updateForm('reportingPreference', 'identified')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: form.reportingPreference === 'identified' }}
                >
                  <MaterialIcons
                    name={form.reportingPreference === 'identified' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={23}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.preferenceTitle, { color: colors.textPrimary }]}>Report with my identity</Text>
                    <Text style={[styles.preferenceDescription, { color: colors.textSecondary }]}>
                      Your name and account details are shown to authorized responders so they can follow up.
                    </Text>
                    {!!profile?.fullName && (
                      <Text style={[styles.profileName, { color: colors.primary }]}>Signed in as {profile.fullName}</Text>
                    )}
                  </View>
                </TouchableOpacity>
                <FieldError>{errors.reportingPreference}</FieldError>

                <View style={[styles.emergencyNotice, { backgroundColor: colors.surfaceCard, borderColor: colors.sos }]}>
                  <MaterialIcons name="warning-amber" size={21} color={colors.sos} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.emergencyTitle, { color: colors.sos }]}>In an immediate emergency</Text>
                    <Text style={[styles.emergencyText, { color: colors.textSecondary }]}>Submitting this report is not a substitute for contacting emergency responders.</Text>
                    <TouchableOpacity
                      style={styles.sosLink}
                      onPress={() => navigation.navigate('SOS')}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.sosLinkText, { color: colors.sos }]}>Open Emergency SOS</Text>
                      <MaterialIcons name="arrow-forward" size={17} color={colors.sos} />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {emergency && (
          <View style={[styles.emergencyCategoryNote, { backgroundColor: colors.surfaceCard, borderColor: colors.sos }]}>
            <MaterialIcons name="emergency" size={19} color={colors.sos} />
            <Text style={[styles.emergencyText, { color: colors.textSecondary }]}>
              If someone is in immediate danger, contact emergency responders now. This form may not be monitored continuously.
            </Text>
          </View>
        )}

        {!!form.incidentType && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }, submitting && styles.buttonDisabled]}
            onPress={confirmSubmit}
            disabled={submitting}
            accessibilityRole="button"
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <MaterialIcons name="send" size={20} color="#fff" />}
            <Text style={styles.primaryButtonText}>{submitting ? 'Submitting report…' : 'Submit Incident Report'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <DropdownModal
        visible={openDropdown === 'category'}
        title="Select incident category"
        options={INCIDENT_CATEGORIES}
        selected={form.category}
        colors={colors}
        onSelect={selectCategory}
        onClose={() => setOpenDropdown('')}
      />
      <DropdownModal
        visible={openDropdown === 'type'}
        title="Select type of incident"
        options={typeOptions}
        selected={form.incidentType}
        colors={colors}
        onSelect={value => {
          updateForm('incidentType', value);
          setOpenDropdown('');
        }}
        onClose={() => setOpenDropdown('')}
      />

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={[styles.modalScrim, { backgroundColor: colors.modalScrim }]}>
          <View style={[styles.confirmModal, { backgroundColor: colors.surfaceCard }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirm incident report</Text>
            <Text style={[styles.confirmSummary, { color: colors.textSecondary }]}>
              {form.category} · {form.incidentType}{'\n'}
              Location: {form.locationText.trim()}{'\n'}
              Photos: {form.photos.length}{'\n'}
              Reporting preference: {form.reportingPreference === 'confidential' ? 'Confidential to responders' : 'With my identity'}
            </Text>
            <Text style={[styles.confirmPrivacy, { color: colors.textSecondary }]}>
              {form.reportingPreference === 'confidential'
                ? 'Responders will not see your identity in the incident view. Authorized administrators can still associate the report with your account in system records.'
                : 'Your identity will be included for authorized responders.'}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setConfirmVisible(false)}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Review form</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.confirmSubmit, { backgroundColor: colors.primary }, submitting && styles.buttonDisabled]}
                onPress={submitReport}
                disabled={submitting}
              >
                <Text style={styles.primaryButtonText}>Confirm & Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  heading: { fontSize: typography.screenTitle, fontWeight: '700', letterSpacing: 0 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  label: { fontSize: typography.label, fontWeight: '600', marginTop: spacing.sm, marginBottom: 5 },
  selectButton: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectText: { flex: 1, fontSize: 15, lineHeight: 20 },
  input: { ...controls.input, paddingVertical: spacing.md, fontSize: typography.body },
  descriptionInput: { minHeight: 132, maxHeight: 230, paddingTop: 13, lineHeight: 21 },
  counter: { alignSelf: 'flex-end', fontSize: 12, marginTop: -5 },
  fieldError: { color: '#B42318', fontSize: 12, marginTop: -3 },
  sectionHeading: { fontSize: typography.sectionTitle, fontWeight: '700', marginTop: spacing.section, marginBottom: 3 },
  helper: { fontSize: typography.supporting, lineHeight: 18, marginBottom: 3 },
  gpsButton: { minHeight: 50, borderRadius: radius.md, padding: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  gpsButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  buttonDisabled: { opacity: 0.65 },
  gpsResult: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.md, padding: 12, marginVertical: 3 },
  gpsResultTitle: { fontSize: 13, fontWeight: '700' },
  gpsCoordinates: { fontSize: 13, fontFamily: 'Courier New', marginTop: 3 },
  gpsAccuracy: { fontSize: 12, marginTop: 2 },
  photoActions: { flexDirection: 'row', gap: 9, marginTop: 6 },
  photoActionsNarrow: { flexDirection: 'column' },
  photoAction: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  photoActionText: { fontSize: 13, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  photoPreview: { width: 92, height: 100, position: 'relative' },
  photoImage: { width: 92, height: 78, borderRadius: 9, backgroundColor: '#E7EAF0' },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  photoSize: { color: '#4B5563', fontSize: 10, marginTop: 3, textAlign: 'center' },
  preferenceCard: { minHeight: 70, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1.5, borderRadius: radius.md, padding: 12, marginTop: 5 },
  preferenceTitle: { fontSize: 14, fontWeight: '800' },
  preferenceDescription: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  profileName: { fontSize: 12, fontWeight: '700', marginTop: 7 },
  emergencyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 19 },
  emergencyCategoryNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: 11, marginTop: 10 },
  emergencyTitle: { fontSize: 13, fontWeight: '800' },
  emergencyText: { flex: 1, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  sosLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 6, marginTop: 5 },
  sosLinkText: { fontSize: 13, fontWeight: '800' },
  suggestion: { borderWidth: 1, borderRadius: radius.sm, padding: 9, marginTop: 5 },
  suggestionText: { fontSize: 12, fontWeight: '700' },
  duplicateNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderRadius: radius.sm, padding: 9, marginTop: 4 },
  duplicateText: { flex: 1, fontSize: 12, lineHeight: 17 },
  primaryButton: { ...controls.primaryButton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  modalScrim: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  dropdownModal: { width: '100%', maxWidth: 520, maxHeight: '82%', borderRadius: radius.lg, padding: 16, overflow: 'hidden' },
  modalHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  dropdownOption: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  dropdownOptionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  confirmModal: { width: '100%', maxWidth: 500, borderRadius: radius.lg, padding: 20 },
  confirmSummary: { fontSize: 14, lineHeight: 22, marginTop: 12 },
  confirmPrivacy: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 15 },
  cancelButton: { minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700' },
  confirmSubmit: { flex: 1, minHeight: 48, marginTop: 0 },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  successTitle: { fontSize: 23, fontWeight: '800', marginTop: 13 },
  successText: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  reference: { color: '#142D4E', backgroundColor: '#E9EEF4', borderRadius: radius.md, padding: 12, fontFamily: 'Courier New', fontSize: 13, textAlign: 'center', marginTop: 17, overflow: 'hidden' },
});

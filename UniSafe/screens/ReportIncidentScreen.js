import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert, Image, ActivityIndicator, Platform, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, categoryMeta } from '../src/theme';
import { useTheme } from '../src/ThemeContext';
import { triageDescription, URGENCY_META } from '../src/utils/aiTriage';
import { checkDuplicate } from '../src/utils/duplicateDetector';
import CategoryBadge from '../src/components/CategoryBadge';
import { api } from '../src/utils/api';

const STEPS = ['Category', 'Details', 'Location', 'Review'];

const INIT = { category: '', title: '', description: '', anonymous: false, location: null, locationText: '', photo: null };

function StepDots({ current, colors }) {
  const { width: winW } = useWindowDimensions();
  const showLabels = winW >= 380;
  return (
    <View style={s.dots}>
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
          <View style={s.dotWrap}>
            <View style={[s.dot, { backgroundColor: colors.border }, i < current && { backgroundColor: colors.ambulance }, i === current && { backgroundColor: colors.primary }]}>
              <Text style={[s.dotNum, { color: colors.textMuted }, i <= current && { color: '#fff' }]}>{i < current ? '✓' : i + 1}</Text>
            </View>
            {showLabels && (
              <Text style={[s.dotLabel, { color: colors.textMuted }, i === current && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{step}</Text>
            )}
          </View>
          {i < STEPS.length - 1 && <View style={[s.dotLine, { backgroundColor: colors.border }, i < current && { backgroundColor: colors.ambulance }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

function StepCategory({ form, setForm, triage, colors }) {
  const DESCS = { Security: 'Theft, assault, suspicious activity', Fire: 'Fire, smoke, gas leak', Ambulance: 'Medical emergency, injury', Other: 'Vandalism, noise, other issues' };
  return (
    <ScrollView style={s.stepScroll} contentContainerStyle={s.stepContent}>
      {triage && (
        <View style={[s.triageBanner, { backgroundColor: URGENCY_META[triage.urgency].bg, borderColor: URGENCY_META[triage.urgency].border }]}>
          <Text style={[s.triageTitle, { color: colors.textPrimary }]}>🤖 AI Suggestion — {triage.confidence}% confidence</Text>
          <Text style={[s.triageSub, { color: URGENCY_META[triage.urgency].color }]}>Category: {triage.category} · {URGENCY_META[triage.urgency].icon} {triage.urgency}</Text>
          <TouchableOpacity style={[s.applyBtn, { backgroundColor: URGENCY_META[triage.urgency].color }]} onPress={() => setForm(f => ({ ...f, category: triage.category }))}>
            <Text style={s.applyBtnText}>Apply suggestion</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={[s.stepPrompt, { color: colors.textSecondary }]}>What type of incident are you reporting?</Text>
      {Object.entries(categoryMeta).map(([key, meta]) => (
        <TouchableOpacity
          key={key}
          style={[s.catCard, { borderColor: colors.border, backgroundColor: colors.surfaceCard }, form.category === key && { borderColor: meta.color, backgroundColor: meta.color + (colors.mode === 'dark' ? '25' : '12') }]}
          onPress={() => setForm(f => ({ ...f, category: key }))}
          activeOpacity={0.8}
        >
          <Text style={s.catIcon}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.catLabel, { color: meta.color }]}>{meta.label}</Text>
            <Text style={[s.catDesc, { color: colors.textSecondary }]}>{DESCS[key]}</Text>
          </View>
          {form.category === key && <Text style={[s.catCheck, { color: meta.color }]}>✓</Text>}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function StepDetails({ form, setForm, triage, duplicate, colors }) {
  return (
    <ScrollView style={s.stepScroll} contentContainerStyle={s.stepContent} keyboardShouldPersistTaps="handled">
      {duplicate && (
        <View style={s.dupWarn}>
          <Text style={s.dupTitle}>⚠️ Possible duplicate — {duplicate.clusterSize} similar reports in the last 15 min</Text>
          <Text style={s.dupBody}>"{duplicate.firstReport.description.slice(0, 80)}…"</Text>
          <Text style={s.dupNote}>Your report will be clustered with existing ones.</Text>
        </View>
      )}
      {triage && (
        <View style={[s.triageInline, { backgroundColor: URGENCY_META[triage.urgency].bg, borderColor: URGENCY_META[triage.urgency].border }]}>
          <Text style={[s.triageInlineText, { color: URGENCY_META[triage.urgency].color }]}>🤖 AI: {triage.category} · {URGENCY_META[triage.urgency].icon} {triage.urgency} ({triage.confidence}%)</Text>
        </View>
      )}
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Incident Title *</Text>
      <TextInput style={[s.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceCard }]} placeholder="Brief title (e.g. Broken fence near Block A)" value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholderTextColor={colors.textMuted} />

      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Description * <Text style={[s.fieldHint, { color: colors.textMuted }]}>(AI triage reads this as you type)</Text></Text>
      <TextInput style={[s.input, s.textarea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceCard }]} placeholder="Describe what happened, when, and any relevant details…" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline numberOfLines={5} textAlignVertical="top" placeholderTextColor={colors.textMuted} />

      <View style={[s.anonBox, { backgroundColor: form.anonymous ? colors.surfaceGold : (colors.mode === 'dark' ? '#1B3320' : '#f0fdf4'), borderColor: form.anonymous ? colors.accent : (colors.mode === 'dark' ? '#2E5D3A' : '#bbf7d0') }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.anonTitle, { color: colors.textPrimary }]}>{form.anonymous ? '🕵️ Anonymous Report' : '👤 Identified Report'}</Text>
          <Text style={[s.anonSub, { color: colors.textSecondary }]}>{form.anonymous ? 'Your identity will not be shared.' : 'Security may contact you for follow-up.'}</Text>
        </View>
        <Switch value={form.anonymous} onValueChange={v => setForm(f => ({ ...f, anonymous: v }))} trackColor={{ false: colors.ambulance, true: colors.other }} thumbColor="#fff" />
      </View>
    </ScrollView>
  );
}

function StepLocation({ form, setForm, colors }) {
  const [locLoading, setLocLoading] = useState(false);
  const capture = async () => {
    setLocLoading(true);
    try {
      if (Platform.OS !== 'web') {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setForm(f => ({ ...f, location: { lat: loc.coords.latitude, lng: loc.coords.longitude } }));
          setLocLoading(false);
          return;
        }
        Alert.alert('Permission Denied', 'Location permission is required.');
      } else {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => { setForm(f => ({ ...f, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } })); setLocLoading(false); },
            () => { Alert.alert('Error', 'Could not get location.'); setLocLoading(false); }
          );
          return;
        }
        Alert.alert('Error', 'Geolocation not supported.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get location.');
    }
    setLocLoading(false);
  };

  const attachPhoto = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = e => { const file = e.target.files[0]; if (file) setForm(f => ({ ...f, photo: URL.createObjectURL(file) })); };
      input.click();
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled) setForm(f => ({ ...f, photo: result.assets[0].uri }));
    } catch {}
  };

  return (
    <ScrollView style={s.stepScroll} contentContainerStyle={s.stepContent}>
      <View style={[s.locCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Text style={[s.locTitle, { color: colors.textPrimary }]}>📍 GPS Location</Text>
        {form.location ? (
          <View style={[s.locCaptured, { backgroundColor: colors.mode === 'dark' ? '#1B3320' : '#f0fdf4' }]}>
            <Text style={[s.locCapturedText, { color: colors.ambulance }]}>✓ Location captured</Text>
            <Text style={[s.locCoords, { color: colors.textSecondary }]}>{form.location.lat.toFixed(4)}, {form.location.lng.toFixed(4)}</Text>
          </View>
        ) : (
          <TouchableOpacity style={[s.locBtn, { backgroundColor: colors.primaryDark }, locLoading && { opacity: 0.6 }]} onPress={capture} disabled={locLoading}>
            {locLoading ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={[s.locBtnText, { color: colors.accent }]}>📍 Auto-capture GPS Location</Text>}
          </TouchableOpacity>
        )}
        <Text style={[s.locHint, { color: colors.textMuted }]}>Coordinates help security respond faster.</Text>
      </View>

      <View style={[s.locCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Text style={[s.locTitle, { color: colors.textPrimary }]}>📝 Location Description <Text style={[s.fieldHint, { color: colors.textMuted }]}>(optional)</Text></Text>
        <TextInput style={[s.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceCard }]} placeholder="e.g. Near Library entrance" value={form.locationText} onChangeText={v => setForm(f => ({ ...f, locationText: v }))} placeholderTextColor={colors.textMuted} />
      </View>

      <View style={[s.locCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <Text style={[s.locTitle, { color: colors.textPrimary }]}>📷 Photo Evidence <Text style={[s.fieldHint, { color: colors.textMuted }]}>(optional)</Text></Text>
        {form.photo ? (
          <View style={[s.photoRow, { backgroundColor: colors.mode === 'dark' ? '#1B3320' : '#f0fdf4' }]}>
            {form.photo.startsWith('http') || form.photo.startsWith('blob:') || form.photo.startsWith('file:') ? (
              <Image source={{ uri: form.photo }} style={s.photoThumb} />
            ) : null}
            <TouchableOpacity onPress={() => setForm(f => ({ ...f, photo: null }))}>
              <Text style={{ color: colors.fire, fontSize: 18 }}>✕ Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[s.photoDash, { borderColor: colors.primary }]} onPress={attachPhoto}>
            <Text style={[s.photoDashText, { color: colors.primary }]}>📷 Attach Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function StepReview({ form, incidentId, triage, duplicate, colors }) {
  const meta = categoryMeta[form.category];
  return (
    <ScrollView style={s.stepScroll} contentContainerStyle={s.stepContent}>
      <View style={[s.reviewCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={[s.reviewHeader, { backgroundColor: meta?.color || colors.primary }]}>
          <Text style={s.reviewHeaderIcon}>{meta?.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.reviewHeaderTitle}>{form.category} Incident</Text>
            <Text style={s.reviewHeaderId}>Draft: {incidentId}</Text>
          </View>
          {triage && (
            <View style={s.urgencyPill}>
              <Text style={s.urgencyPillText}>{URGENCY_META[triage.urgency].icon} {triage.urgency}</Text>
            </View>
          )}
        </View>
        <View style={s.reviewBody}>
          <View style={[s.reviewRow, { borderBottomColor: colors.border }]}><Text style={[s.reviewRowLabel, { color: colors.textMuted }]}>TITLE</Text><Text style={[s.reviewRowValue, { color: colors.textPrimary }]}>{form.title}</Text></View>
          <View style={[s.reviewRow, { borderBottomColor: colors.border }]}><Text style={[s.reviewRowLabel, { color: colors.textMuted }]}>DESCRIPTION</Text><Text style={[s.reviewRowValue, { color: colors.textPrimary }]}>{form.description}</Text></View>
          <View style={[s.reviewRow, { borderBottomColor: colors.border }]}><Text style={[s.reviewRowLabel, { color: colors.textMuted }]}>IDENTITY</Text><Text style={[s.reviewRowValue, { color: colors.textPrimary }]}>{form.anonymous ? '🕵️ Anonymous' : '👤 Identified'}</Text></View>
          <View style={[s.reviewRow, { borderBottomColor: colors.border }]}><Text style={[s.reviewRowLabel, { color: colors.textMuted }]}>LOCATION</Text><Text style={[s.reviewRowValue, { color: colors.textPrimary }]}>{form.location ? `${form.location.lat.toFixed(4)}, ${form.location.lng.toFixed(4)}` : form.locationText || 'Not captured'}</Text></View>
          <View style={[s.reviewRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}><Text style={[s.reviewRowLabel, { color: colors.textMuted }]}>PHOTO</Text><Text style={[s.reviewRowValue, { color: colors.textPrimary }]}>{form.photo ? 'Preview only. Photo uploads are not available yet.' : 'No photo selected'}</Text></View>
        </View>
      </View>
      {duplicate && (
        <View style={s.dupWarn}>
          <Text style={s.dupTitle}>⚠️ Will be merged with {duplicate.clusterSize - 1} similar report(s).</Text>
        </View>
      )}
      <Text style={[s.reviewNote, { color: colors.textMuted }]}>Review before submitting. A reference will be shown when the server confirms receipt.</Text>
    </ScrollView>
  );
}

export default function ReportIncidentScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INIT);
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [triage, setTriage] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [loading, setLoading] = useState(false);
  const incidentRef = useRef(`INC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);

  useEffect(() => {
    const result = triageDescription(form.description);
    setTriage(result);
    const cat = form.category || result?.category;
    setDuplicate(cat && form.description.trim().length >= 10 ? checkDuplicate(form.description, cat) : null);
  }, [form.description, form.category]);

  const canNext = () => {
    if (step === 0) return !!form.category;
    if (step === 1) return form.title.trim() && form.description.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.createIncident({
        category: form.category,
        title: form.title,
        description: form.description,
        latitude: form.location?.lat ?? null,
        longitude: form.location?.lng ?? null,
        location_text: form.locationText || null,
        priority: triage?.urgency || 'Medium',
        is_anonymous: form.anonymous ?? false,
      });
      if (!result?.id) throw new Error('The server did not confirm your report.');
      setSubmittedId(result.id);
      setSubmitted(true);
    } catch (error) {
      Alert.alert('Report not confirmed', `${error.message} Your form is still here. Check My Reports before retrying to avoid a duplicate.`);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={[s.successScreen, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 60, marginBottom: 16 }}>✅</Text>
        <Text style={[s.successTitle, { color: colors.textPrimary }]}>Report Submitted</Text>
        <Text style={[s.successSub, { color: colors.textSecondary }]}>Your report has been received. Track its status in My Reports.{form.photo ? '\nYour selected photo was not uploaded.' : ''}</Text>
        {triage && (
          <View style={[s.triageInline, { backgroundColor: URGENCY_META[triage.urgency].bg, borderColor: URGENCY_META[triage.urgency].border, marginBottom: 10 }]}>
            <Text style={[s.triageInlineText, { color: URGENCY_META[triage.urgency].color }]}>{URGENCY_META[triage.urgency].icon} Flagged as {triage.urgency} urgency</Text>
          </View>
        )}
        {duplicate && <Text style={[s.successSub, { color: colors.textSecondary }]}>Merged with {duplicate.clusterSize - 1} similar report(s).</Text>}
        <Text style={[s.incidentId, { color: colors.primary, backgroundColor: colors.surfaceGold, borderColor: colors.accent }]}>{submittedId}</Text>
        <TouchableOpacity style={[s.backHomeBtn, { backgroundColor: colors.primary, borderColor: colors.accent }]} onPress={() => navigation.navigate('Home')}>
          <Text style={[s.backHomeBtnText, { color: colors.textOnGold }]}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.dotsWrap, { backgroundColor: colors.surfaceCard, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 8) + 4 }]}>
        <StepDots current={step} colors={colors} />
      </View>
      {step === 0 && <StepCategory form={form} setForm={setForm} triage={triage} colors={colors} />}
      {step === 1 && <StepDetails form={form} setForm={setForm} triage={triage} duplicate={duplicate} colors={colors} />}
      {step === 2 && <StepLocation form={form} setForm={setForm} colors={colors} />}
      {step === 3 && <StepReview form={form} incidentId={incidentRef.current} triage={triage} duplicate={duplicate} colors={colors} />}
      <View style={[s.footer, { backgroundColor: colors.surfaceCard, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {step > 0 && (
          <TouchableOpacity style={[s.backBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => setStep(p => p - 1)} activeOpacity={0.8}>
            <Text style={[s.backBtnText, { color: colors.textSecondary }]}>← Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.nextBtn, { backgroundColor: colors.primary }, !canNext() && { backgroundColor: colors.border }, step > 0 && { flex: 1, marginLeft: 8 }]}
          onPress={() => step < STEPS.length - 1 ? setStep(p => p + 1) : handleSubmit()}
          disabled={!canNext() || loading}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.nextBtnText, !canNext() && { color: colors.textMuted }]} numberOfLines={1}>{step === STEPS.length - 1 ? '✓ Submit Report' : 'Continue →'}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  dotsWrap:        { borderBottomWidth: 1 },
  dots:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  dotWrap:         { alignItems: 'center', gap: 3, minWidth: 36 },
  dot:             { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotNum:          { fontSize: 12, fontWeight: '700' },
  dotLabel:        { fontSize: 10 },
  dotLine:         { flex: 1, height: 2, marginBottom: 12, marginHorizontal: 2 },
  stepScroll:      { flex: 1 },
  stepContent:     { padding: 16, paddingBottom: 32 },
  stepPrompt:      { fontSize: 15, marginBottom: 16 },
  catCard:         { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: radius.lg, borderWidth: 2, marginBottom: 12, gap: 16 },
  catIcon:         { fontSize: 32 },
  catLabel:        { fontSize: 16, fontWeight: '700' },
  catDesc:         { fontSize: 12, marginTop: 2 },
  catCheck:        { fontSize: 20 },
  triageBanner:    { borderWidth: 1.5, borderRadius: radius.md, padding: 12, marginBottom: 16 },
  triageTitle:     { fontSize: 13, fontWeight: '700' },
  triageSub:       { fontSize: 12, marginTop: 2 },
  applyBtn:        { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: radius.full, alignSelf: 'flex-start' },
  applyBtnText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  triageInline:    { borderWidth: 1, borderRadius: radius.md, padding: 10, marginBottom: 12 },
  triageInlineText:{ fontSize: 13, fontWeight: '600' },
  dupWarn:         { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a', borderRadius: radius.md, padding: 12, marginBottom: 12 },
  dupTitle:        { fontSize: 13, fontWeight: '700', color: '#92400e' },
  dupBody:         { fontSize: 12, marginTop: 2 },
  dupNote:         { fontSize: 11, marginTop: 4 },
  fieldLabel:      { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldHint:       { fontWeight: '400' },
  input:           { borderWidth: 1.5, borderRadius: radius.md, padding: 13, fontSize: 15, marginBottom: 14 },
  textarea:        { height: 110, textAlignVertical: 'top' },
  anonBox:         { borderWidth: 1.5, borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  anonTitle:       { fontSize: 14, fontWeight: '700' },
  anonSub:         { fontSize: 12, marginTop: 2 },
  locCard:         { borderWidth: 1.5, borderRadius: radius.md, padding: 16, marginBottom: 14 },
  locTitle:        { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  locBtn:          { borderRadius: radius.md, padding: 12, alignItems: 'center' },
  locBtnText:      { fontSize: 14, fontWeight: '600' },
  locCaptured:     { borderRadius: radius.sm, padding: 10 },
  locCapturedText: { fontSize: 13, fontWeight: '600' },
  locCoords:       { fontSize: 12, marginTop: 2, fontFamily: 'Courier New' },
  locHint:         { fontSize: 11, marginTop: 8 },
  photoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.sm, padding: 10 },
  photoThumb:      { width: 60, height: 60, borderRadius: 6 },
  photoDash:       { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, padding: 12, alignItems: 'center' },
  photoDashText:   { fontSize: 14, fontWeight: '600' },
  reviewCard:      { borderRadius: radius.lg, borderWidth: 1.5, overflow: 'hidden', marginBottom: 12 },
  reviewHeader:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  reviewHeaderIcon:{ fontSize: 24 },
  reviewHeaderTitle:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  reviewHeaderId:  { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'Courier New' },
  urgencyPill:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  urgencyPillText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  reviewBody:      { padding: 16, gap: 12 },
  reviewRow:       { borderBottomWidth: 1, paddingBottom: 10 },
  reviewRowLabel:  { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  reviewRowValue:  { fontSize: 14 },
  reviewNote:      { fontSize: 12, textAlign: 'center' },
  footer:          { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  nextBtn:         { flex: 1, borderRadius: radius.md, padding: 15, alignItems: 'center' },
  nextBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  backBtn:         { paddingHorizontal: 20, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  backBtnText:     { fontSize: 15, fontWeight: '600' },
  successScreen:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successTitle:    { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  successSub:      { fontSize: 14, marginBottom: 8, textAlign: 'center' },
  incidentId:      { fontFamily: 'Courier New', fontSize: 16, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.md, marginBottom: 28, borderWidth: 1 },
  backHomeBtn:     { borderRadius: radius.md, paddingHorizontal: 32, paddingVertical: 14, borderWidth: 2 },
  backHomeBtnText: { fontSize: 15, fontWeight: '700' },
});

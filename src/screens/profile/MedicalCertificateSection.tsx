import React, { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { format, isValid, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import useMedicalCertificate, { MedicalCertificateType } from "../../hooks/useMedicalCertificate";
import { CardCropperModal } from "../../components/CardCropperModal";
import { autoCropDocument, compressImageToMaxSize } from "../../utils/imageProcessing";
import { UI } from "../../components/Screen";
import { getCertificateStatus } from "../../utils/medicalCertificate";
import { ZoomableImageModal } from "../../components/ZoomableImageModal";
import { saveImageToDevice } from "../../utils/saveImageToDevice";

type ToastFn = (message: string, tone: "success" | "error") => void;

type PendingImage = {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
  size: number;
  width?: number | null;
  height?: number | null;
  base64: string;
};

type CropCandidate = {
  uri: string;
  mimeType: "image/jpeg" | "image/png";
  width?: number | null;
  height?: number | null;
};

const CERT_TYPES: { value: MedicalCertificateType; label: string }[] = [
  { value: "semplice", label: "Semplice" },
  { value: "agonistico", label: "Agonistico" },
];

const DATE_INPUT_FORMAT = "yyyy-MM-dd";
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const formatDate = (date: Date | null | undefined) => {
  if (!date) return "";
  try {
    return format(date, "dd MMM yyyy", { locale: it });
  } catch {
    return "";
  }
};

const formatInputDate = (date: Date | null | undefined) => {
  if (!date) return "";
  try {
    return format(date, DATE_INPUT_FORMAT);
  } catch {
    return "";
  }
};

const DEFAULT_ALERT_DAYS = 30;
const MODAL_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.8);

const ensureImagePermissions = async (source: "camera" | "library") => {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permesso necessario", "Consenti l'accesso alla fotocamera per scattare il certificato.");
      return false;
    }
    return true;
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Permesso necessario", "Consenti l'accesso alla libreria foto per selezionare il certificato.");
    return false;
  }
  return true;
};

const pickImageFromSource = async (source: "camera" | "library") => {
  const allowed = await ensureImagePermissions(source);
  if (!allowed) return null;

  const pickerFn =
    source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  const result = await pickerFn({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
    exif: false,
  });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  if (asset.type && asset.type !== "image") {
    Alert.alert("Formato non supportato", "Seleziona un'immagine JPG o PNG.");
    return null;
  }
  if (asset.mimeType && asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png") {
    Alert.alert("Formato non supportato", "Puoi caricare solo file JPG o PNG.");
    return null;
  }
  return asset;
};

type MedicalCertificateSectionProps = {
  showToast: ToastFn;
  hookProps?: ReturnType<typeof useMedicalCertificate>;
};

export function MedicalCertificateSection({ showToast, hookProps }: MedicalCertificateSectionProps) {
  const hook = hookProps ?? useMedicalCertificate();
  const { certificate, loading, uploadCertificate, deleteCertificate, updateMetadata } = hook;

  const [typeValue, setTypeValue] = useState<MedicalCertificateType | null>(null);
  const [expiryInput, setExpiryInput] = useState<string>("");
  const [alertDaysInput, setAlertDaysInput] = useState<string>(String(DEFAULT_ALERT_DAYS));
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modifyingMeta, setModifyingMeta] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [cropSource, setCropSource] = useState<CropCandidate | null>(null);
  const [autoCropNote, setAutoCropNote] = useState<string | null>(null);
  const [manualCropCandidate, setManualCropCandidate] = useState<CropCandidate | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [iosPickerDate, setIosPickerDate] = useState<Date>(new Date());
  const isIos = Platform.OS === "ios";

  const normalizedExpiryInput = expiryInput.trim();
  const parsedExpiryDate = useMemo(() => {
    if (!normalizedExpiryInput) {
      return null;
    }
    if (!DATE_INPUT_REGEX.test(normalizedExpiryInput)) return null;
    const parsed = parseISO(normalizedExpiryInput);
    return isValid(parsed) ? parsed : null;
  }, [normalizedExpiryInput]);

  useEffect(() => {
    if (!certificate) {
      setTypeValue(null);
      setExpiryInput("");
      setAlertDaysInput(String(DEFAULT_ALERT_DAYS));
      return;
    }
    setTypeValue(certificate.type);
    setExpiryInput(formatInputDate(certificate.expiresAt ? new Date(certificate.expiresAt) : null));
    setAlertDaysInput(String(certificate.alertDays ?? DEFAULT_ALERT_DAYS));
  }, [certificate?.type, certificate?.expiresAt, certificate?.alertDays]);

  const onSelectType = (next: MedicalCertificateType) => {
    setTypeValue(next);
  };

  const resetPendingState = () => {
    setPendingImage(null);
    setAutoCropNote(null);
    setManualCropCandidate(null);
  };

  const finalizePending = async (uri: string, mime: "image/jpeg" | "image/png", width?: number | null, height?: number | null) => {
    try {
      const compression = await compressImageToMaxSize({
        uri,
        mimeType: mime,
        initialWidth: width ?? undefined,
        initialHeight: height ?? undefined,
      });
      setPendingImage({
        uri: compression.uri,
        mimeType: compression.mimeType,
        size: compression.size,
        width: compression.width ?? null,
        height: compression.height ?? null,
        base64: compression.base64,
      });
      showToast("Certificato pronto per il salvataggio.", "success");
    } catch (err: any) {
      console.error("[MedicalCertificate] finalizePending", err);
      Alert.alert(
        "File troppo grande",
        "Non è stato possibile comprimere l'immagine sotto 1 MB. Ripeti lo scatto più da vicino o usa una foto più leggera."
      );
      resetPendingState();
    }
  };

  const processAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.uri) return;
    const mime = (asset.mimeType as "image/jpeg" | "image/png" | undefined) ?? "image/jpeg";
    setProcessing(true);
    try {
      const normalized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ rotate: 0 }],
        { compress: 1, format: mime === "image/png" ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG }
      );
      const candidate: CropCandidate = {
        uri: normalized.uri,
        mimeType: mime,
        width: normalized.width,
        height: normalized.height,
      };
      setManualCropCandidate(candidate);

      const autoCropped = await autoCropDocument({
        uri: normalized.uri,
        width: normalized.width,
        height: normalized.height,
        formatHint: mime === "image/png" ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
      });

      if (autoCropped) {
        setAutoCropNote("Ritaglio automatico applicato. Puoi rifinirlo manualmente se necessario.");
        await finalizePending(autoCropped.uri, mime, autoCropped.width, autoCropped.height);
      } else {
        setAutoCropNote(null);
        setCropSource(candidate);
      }
    } catch (err: any) {
      console.error("[MedicalCertificate] processAsset error", err);
      showToast(err?.message ?? "Impossibile elaborare l'immagine selezionata.", "error");
    } finally {
      setProcessing(false);
    }
  };

  const handlePickCertificate = async () => {
    const choose = () => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Annulla", "Fotocamera", "Libreria foto"],
            cancelButtonIndex: 0,
          },
          async (idx) => {
            if (idx === 1) {
              const asset = await pickImageFromSource("camera");
              if (asset) await processAsset(asset);
            } else if (idx === 2) {
              const asset = await pickImageFromSource("library");
              if (asset) await processAsset(asset);
            }
          }
        );
      } else {
        Alert.alert("Carica certificato", "Seleziona la sorgente", [
          { text: "Annulla", style: "cancel" },
          {
            text: "Fotocamera",
            onPress: async () => {
              const asset = await pickImageFromSource("camera");
              if (asset) await processAsset(asset);
            },
          },
          {
            text: "Libreria foto",
            onPress: async () => {
              const asset = await pickImageFromSource("library");
              if (asset) await processAsset(asset);
            },
          },
        ]);
      }
    };
    choose();
  };

  const typeError = !typeValue ? "Seleziona il tipo di certificato" : null;
  const expiryError = !parsedExpiryDate ? "Seleziona la data di scadenza" : null;
  const alertValue = parseInt(alertDaysInput, 10);
  const alertError = Number.isNaN(alertValue) || alertValue <= 0 ? "Inserisci un numero positivo" : null;

  const canSave =
    !!typeValue && !!parsedExpiryDate && !alertError && !expiryError && !!pendingImage && !uploading;

  const handleSave = async () => {
    if (!pendingImage || !typeValue || !parsedExpiryDate || alertError || expiryError) return;
    try {
      setUploading(true);
      await uploadCertificate({
        base64: pendingImage.base64,
        mimeType: pendingImage.mimeType,
        type: typeValue,
        expiresAt: parsedExpiryDate,
        alertDays: alertValue,
        size: pendingImage.size,
        width: pendingImage.width ?? undefined,
        height: pendingImage.height ?? undefined,
      });
      resetPendingState();
      showToast("Certificato salvato correttamente.", "success");
    } catch (err: any) {
      console.error("[MedicalCertificate] handleSave error", err);
      showToast(err?.message ?? "Impossibile salvare il certificato.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Sei sicuro di voler eliminare il certificato?", undefined, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            setDeleting(true);
            await deleteCertificate();
            showToast("Certificato eliminato.", "success");
            resetPendingState();
          } catch (err: any) {
            console.error("[MedicalCertificate] delete", err);
            showToast(err?.message ?? "Impossibile eliminare il certificato.", "error");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleReplace = () => {
    Alert.alert(
      "Sostituire il certificato?",
      "Per caricare un nuovo certificato dobbiamo eliminare quello esistente.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Continua",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteCertificate();
              resetPendingState();
              showToast("Certificato precedente eliminato. Carica il nuovo file.", "success");
              handlePickCertificate();
            } catch (err: any) {
              console.error("[MedicalCertificate] replace", err);
              showToast(err?.message ?? "Impossibile sostituire il certificato.", "error");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const openMetadataEditor = () => {
    setEditingMetadata(true);
  };

  const closeMetadataEditor = () => {
    setEditingMetadata(false);
    if (certificate) {
      setTypeValue(certificate.type);
      setExpiryInput(formatInputDate(certificate.expiresAt ? new Date(certificate.expiresAt) : null));
      setAlertDaysInput(String(certificate.alertDays ?? DEFAULT_ALERT_DAYS));
    } else {
      setExpiryInput("");
    }
  };

  const submitMetadataChanges = async () => {
    if (!certificate || !typeValue || !parsedExpiryDate || alertError || expiryError) {
      showToast("Compila correttamente i metadati.", "error");
      return;
    }
    try {
      setModifyingMeta(true);
      await updateMetadata({
        type: typeValue,
        expiresAt: parsedExpiryDate,
        alertDays: alertValue,
      });
      setEditingMetadata(false);
      showToast("Metadati aggiornati.", "success");
    } catch (err: any) {
      console.error("[MedicalCertificate] update metadata", err);
      showToast(err?.message ?? "Impossibile aggiornare i metadati.", "error");
    } finally {
      setModifyingMeta(false);
    }
  };

  const setExpiryFromDate = (date: Date) => {
    setExpiryInput(formatInputDate(date));
  };

  const openExpiryPicker = () => {
    const initialDate = parsedExpiryDate ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode: "date",
        value: initialDate,
        display: "calendar",
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type !== "set" || !selectedDate) return;
          setExpiryFromDate(selectedDate);
        },
      });
      return;
    }
    setIosPickerDate(initialDate);
    setIosPickerVisible(true);
  };

  const closeIosPicker = () => setIosPickerVisible(false);
  const confirmIosPicker = () => {
    setExpiryFromDate(iosPickerDate);
    setIosPickerVisible(false);
  };

  const statusInfo = useMemo(() => {
    const status = getCertificateStatus(certificate);
    const tone: "success" | "warning" | "danger" =
      status.kind === "expired" ? "danger" : status.kind === "warning" ? "warning" : "success";
    const label =
      status.kind === "expired"
        ? "Scaduto"
        : status.kind === "warning"
        ? "Sta per scadere"
        : "Valido";
    return { tone, label };
  }, [certificate]);

  const remotePreviewUri = useMemo(() => {
    if (!certificate?.imageBase64) return null;
    const mime = certificate.mimeType ?? "image/jpeg";
    return `data:${mime};base64,${certificate.imageBase64}`;
  }, [certificate?.imageBase64, certificate?.mimeType]);

  const previewUri = pendingImage?.uri ?? remotePreviewUri;
  const previewRotation = pendingImage ? 0 : certificate?.rotation ?? 0;

  const handleExportCertificate = async () => {
    if (!previewUri && !pendingImage?.base64 && !certificate?.imageBase64) {
      Alert.alert("Nessun certificato", "Carica o seleziona un certificato prima di salvarlo sul dispositivo.");
      return;
    }
    try {
      setExporting(true);
      await saveImageToDevice({
        base64: pendingImage?.base64 ?? certificate?.imageBase64 ?? null,
        uri: previewUri ?? pendingImage?.uri ?? null,
        mimeType: pendingImage?.mimeType ?? certificate?.mimeType ?? "image/jpeg",
        suggestedFileName: "certificato-medico",
      });
      showToast("Certificato salvato sul dispositivo.", "success");
    } catch (err: any) {
      showToast(err?.message ?? "Impossibile salvare il certificato sul dispositivo.", "error");
    } finally {
      setExporting(false);
    }
  };

  const expiryDisplayValue = parsedExpiryDate ? formatDate(parsedExpiryDate) : "Seleziona una data";

  if (loading && !certificate && !pendingImage) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color={UI.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!certificate ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>Certificato Medico</Text>
          <Text style={styles.cardSubtitle}>
            Carica la foto del tuo certificato in formato JPG o PNG (max 1 MB).
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Tipo certificato</Text>
            <View style={styles.segmented}>
              {CERT_TYPES.map((entry) => {
                const selected = typeValue === entry.value;
                return (
                  <Pressable
                    key={entry.value}
                    onPress={() => onSelectType(entry.value)}
                    style={[
                      styles.segmentButton,
                      selected && styles.segmentButtonSelected,
                    ]}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {entry.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!!typeError && <Text style={styles.errorText}>{typeError}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Data di scadenza</Text>
            <Pressable
              onPress={openExpiryPicker}
              accessibilityRole="button"
              style={[styles.input, styles.dateInputButton, expiryError && styles.inputError]}
            >
              <Text style={parsedExpiryDate ? styles.dateInputValue : styles.dateInputPlaceholder}>
                {expiryDisplayValue}
              </Text>
            </Pressable>
            <Text style={styles.helperText}>Seleziona la data dal calendario</Text>
            {!!expiryError && <Text style={styles.errorText}>{expiryError}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Giorni di preavviso</Text>
            <TextInput
              value={alertDaysInput}
              onChangeText={setAlertDaysInput}
              keyboardType="number-pad"
              style={[styles.input, alertError && styles.inputError]}
              placeholder={String(DEFAULT_ALERT_DAYS)}
            />
            {!!alertError && <Text style={styles.errorText}>{alertError}</Text>}
          </View>

          {!!pendingImage && (
            <Pressable
              style={styles.pendingPreview}
              onPress={() => {
                if (pendingImage.uri) setPreviewModalVisible(true);
              }}
              accessibilityRole="imagebutton"
              accessibilityLabel="Anteprima certificato medico"
            >
              <Image
                source={{ uri: pendingImage.uri }}
                style={styles.pendingPreviewImage}
                resizeMode="contain"
              />
            </Pressable>
          )}
          {!!autoCropNote && <Text style={styles.helperText}>{autoCropNote}</Text>}

          <Pressable
            style={[styles.primaryButton, processing && styles.primaryButtonDisabled]}
            onPress={handlePickCertificate}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Carica certificato</Text>
            )}
          </Pressable>

          {manualCropCandidate && (
            <Pressable
              onPress={() => setCropSource(manualCropCandidate)}
              style={styles.linkButton}
            >
              <Text style={styles.linkButtonText}>Ritaglia manualmente</Text>
            </Pressable>
          )}

          <Pressable
            style={[
              styles.saveButton,
              (!canSave || uploading) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Salva</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.filledCard}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Certificato Medico</Text>
            <Text style={styles.metaLine}>
              {certificate.type === "agonistico" ? "Agonistico" : "Semplice"} ·{" "}
              {certificate.expiresAt ? formatDate(certificate.expiresAt) : "Data non indicata"}
            </Text>
          </View>

          <Pressable
            style={styles.previewWrapper}
            onPress={() => {
              if (previewUri) setPreviewModalVisible(true);
            }}
            accessibilityRole="imagebutton"
            accessibilityLabel="Anteprima certificato medico"
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={[styles.previewImage, { transform: [{ rotate: `${pendingImage ? 0 : previewRotation}deg` }] }]}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewPlaceholderText}>Carica un certificato per visualizzare la preview</Text>
              </View>
            )}
          </Pressable>
          <Text style={styles.helperText}>Tocca la preview per vederla a tutto schermo.</Text>

          <Text style={styles.helperText}>
            Giorni di preavviso: {certificate.alertDays ?? DEFAULT_ALERT_DAYS}
          </Text>

          <View style={styles.actionsColumn}>
            <Pressable
              onPress={handleReplace}
              style={[styles.primaryButton, deleting && styles.primaryButtonDisabled]}
              disabled={deleting}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sostituisci</Text>}
            </Pressable>
            <Pressable
              onPress={handleExportCertificate}
              style={[styles.secondaryButton, (exporting || deleting) && styles.secondaryButtonDisabled]}
              disabled={exporting || deleting}
            >
              {exporting ? (
                <ActivityIndicator color={UI.colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Salva sul dispositivo</Text>
              )}
            </Pressable>
            <Pressable onPress={openMetadataEditor} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Modifica metadati</Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
              disabled={deleting}
            >
              {deleting ? <ActivityIndicator color="#DC2626" /> : <Text style={styles.deleteButtonText}>Elimina</Text>}
            </Pressable>
          </View>
        </View>
      )}

      {editingMetadata ? (
        <View style={styles.metaModalRoot}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.metaModalOverlay}
          >
            <TouchableWithoutFeedback onPress={closeMetadataEditor}>
              <View style={styles.metaModalBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.metaModalSheetContainer}>
              <View style={styles.metaModalSheet}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.metaModalContent}
                >
                  <Text style={styles.modalTitle}>Modifica metadati</Text>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Tipo certificato</Text>
                    <View style={styles.segmented}>
                      {CERT_TYPES.map((entry) => {
                        const selected = typeValue === entry.value;
                        return (
                          <Pressable
                            key={entry.value}
                            onPress={() => onSelectType(entry.value)}
                            style={[
                              styles.segmentButton,
                              selected && styles.segmentButtonSelected,
                            ]}
                          >
                            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                              {entry.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {!!typeError && <Text style={styles.errorText}>{typeError}</Text>}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Data di scadenza</Text>
                    <Pressable
                      onPress={openExpiryPicker}
                      accessibilityRole="button"
                      style={[styles.input, styles.dateInputButton, expiryError && styles.inputError]}
                    >
                      <Text style={parsedExpiryDate ? styles.dateInputValue : styles.dateInputPlaceholder}>
                        {expiryDisplayValue}
                      </Text>
                    </Pressable>
                    <Text style={styles.helperText}>Seleziona la data dal calendario</Text>
                    {!!expiryError && <Text style={styles.errorText}>{expiryError}</Text>}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Giorni di preavviso</Text>
                    <TextInput
                      value={alertDaysInput}
                      onChangeText={setAlertDaysInput}
                      keyboardType="number-pad"
                      style={[styles.input, alertError && styles.inputError]}
                      placeholder={String(DEFAULT_ALERT_DAYS)}
                    />
                    {!!alertError && <Text style={styles.errorText}>{alertError}</Text>}
                  </View>

                  <View style={styles.metaModalActions}>
                    <Pressable
                      onPress={closeMetadataEditor}
                      style={[styles.secondaryButton, styles.metaModalActionButton]}
                    >
                      <Text style={styles.secondaryButtonText}>Annulla</Text>
                    </Pressable>
                    <Pressable
                      onPress={submitMetadataChanges}
                      style={[
                        styles.primaryButton,
                        styles.metaModalActionButton,
                        (modifyingMeta || alertError || expiryError) && styles.primaryButtonDisabled,
                      ]}
                      disabled={modifyingMeta || !!alertError || !!expiryError}
                    >
                      {modifyingMeta ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salva</Text>}
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      {/* Picker iOS per “Data di scadenza” */}
      {Platform.OS === "ios" && (
        <Modal
          visible={iosPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={closeIosPicker}
        >
          <View style={styles.iosPickerWrapper}>
            {/* backdrop cliccabile sopra il foglio */}
            <TouchableWithoutFeedback onPress={closeIosPicker}>
              <View style={styles.iosPickerBackdrop} />
            </TouchableWithoutFeedback>

            {/* sheet in basso con pulsanti + picker */}
            <View style={styles.iosPickerSheet}>
              <View style={styles.iosPickerActions}>
                <Pressable onPress={closeIosPicker} style={styles.iosPickerButton}>
                  <Text style={styles.iosPickerButtonText}>Annulla</Text>
                </Pressable>
                <Pressable onPress={confirmIosPicker} style={styles.iosPickerButton}>
                  <Text style={[styles.iosPickerButtonText, styles.iosPickerButtonPrimary]}>
                    Seleziona
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosPickerDate}
                mode="date"
                display={isIos ? "spinner" : "default"}
                preferredDatePickerStyle={isIos ? "spinner" : undefined}
                onChange={(_event, date) => {
                  if (date) setIosPickerDate(date);
                }}
                locale="it-IT"
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      )}

      <CardCropperModal
        visible={!!cropSource}
        imageUri={cropSource?.uri}
        imageWidth={cropSource?.width ?? undefined}
        imageHeight={cropSource?.height ?? undefined}
        onCancel={() => setCropSource(null)}
        onConfirm={async (result) => {
          const effectiveMime = cropSource?.mimeType === "image/png" ? "image/png" : "image/jpeg";
          setManualCropCandidate({
            uri: result.uri,
            mimeType: effectiveMime,
            width: result.width,
            height: result.height,
          });
          await finalizePending(result.uri, effectiveMime, result.width, result.height);
          setCropSource(null);
        }}
      />

      <ZoomableImageModal
        visible={previewModalVisible}
        uri={previewUri}
        onClose={() => setPreviewModalVisible(false)}
        rotationDeg={pendingImage ? 0 : previewRotation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: UI.spacing.lg,
    gap: UI.spacing.lg,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: UI.spacing.md,
  },
  filledCard: {
    backgroundColor: "#fff",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: UI.spacing.md,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: UI.radius.lg,
    padding: UI.spacing.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: UI.colors.text,
  },
  cardSubtitle: {
    color: UI.colors.muted,
    lineHeight: 20,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontWeight: "700",
    color: UI.colors.text,
  },
  segmented: {
    flexDirection: "row",
    gap: UI.spacing.sm,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5F5",
    paddingVertical: 10,
    borderRadius: UI.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  segmentButtonSelected: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  segmentText: {
    fontWeight: "700",
    color: UI.colors.text,
  },
  segmentTextSelected: {
    color: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5F5",
    borderRadius: UI.radius.md,
    paddingVertical: 12,
    paddingHorizontal: UI.spacing.sm,
    backgroundColor: "#F8FAFC",
  },
  dateInputButton: {
    justifyContent: "center",
  },
  dateInputValue: {
    color: UI.colors.text,
    fontWeight: "600",
  },
  dateInputPlaceholder: {
    color: UI.colors.muted,
  },
  inputError: {
    borderColor: "#f87171",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
  },
  helperText: {
    color: UI.colors.muted,
    fontSize: 12,
  },
  pendingPreview: {
    height: 220,
    borderRadius: UI.radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  pendingPreviewImage: {
    width: "100%",
    height: "100%",
  },
  primaryButton: {
    backgroundColor: UI.colors.primary,
    borderRadius: UI.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  linkButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  linkButtonText: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: "#111827",
    borderRadius: UI.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  filledCardActions: {
    flexDirection: "row",
    gap: UI.spacing.sm,
  },
  headerRow: {
    gap: 4,
  },
  metaLine: {
    color: UI.colors.muted,
    marginTop: 2,
  },
  previewWrapper: {
    marginTop: UI.spacing.sm,
    borderRadius: UI.radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    backgroundColor: "#fff",
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: 280,
  },
  previewPlaceholder: {
    padding: UI.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  previewPlaceholderText: {
    color: "#475569",
    fontWeight: "600",
  },
  actionsColumn: {
    gap: UI.spacing.sm,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: UI.colors.primary,
    borderRadius: UI.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: UI.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: "#DC2626",
    fontWeight: "700",
  },
  metaModalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 20,
  },
  metaModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    paddingHorizontal: UI.spacing.md,
  },
  metaModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  metaModalSheetContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: UI.spacing.md,
  },
  metaModalSheet: {
    width: "100%",
    maxHeight: MODAL_MAX_HEIGHT,
    borderRadius: UI.radius.lg,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  metaModalContent: {
    padding: UI.spacing.lg,
    gap: UI.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: UI.colors.text,
  },
  metaModalActions: {
    flexDirection: "row",
    gap: UI.spacing.sm,
  },
  metaModalActionButton: {
    flex: 1,
  },
  iosPickerWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  iosPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iosPickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: UI.radius.xl,
    borderTopRightRadius: UI.radius.xl,
    paddingBottom: UI.spacing.lg + UI.spacing.sm,
    paddingHorizontal: UI.spacing.lg,
    paddingTop: UI.spacing.md,
    minHeight: 320,
  },
  iosPickerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: UI.spacing.sm,
  },
  iosPickerButton: {
    paddingVertical: UI.spacing.xs,
    paddingHorizontal: UI.spacing.sm,
  },
  iosPickerButtonText: {
    fontSize: 16,
    color: UI.colors.text,
  },
  iosPickerButtonPrimary: {
    color: UI.colors.primary,
    fontWeight: "700",
  },
  iosPicker: {
    width: "100%",
    minHeight: 260,
  },
});
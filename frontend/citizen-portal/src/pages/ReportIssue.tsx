import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UploadSimple, CheckCircle, Warning, X } from "@phosphor-icons/react";
import type { ComplaintCategory } from "../types/complaint";
import LocationPicker, {
  type SelectedLocation,
} from "../components/LocationPicker";
import { api, type DuplicateCandidate } from "../api/client";

const CATEGORY_OPTIONS: { value: ComplaintCategory; label: string }[] = [
  { value: "roads", label: "Roads & Potholes" },
  { value: "water_supply", label: "Water Supply" },
  { value: "electricity", label: "Electricity / Streetlights" },
  { value: "sanitation", label: "Sanitation & Garbage" },
  { value: "public_safety", label: "Public Safety" },
  { value: "other", label: "Other" },
];

type Step = "details" | "location" | "review" | "duplicates" | "submitted";

export default function ReportIssue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get(
    "category",
  ) as ComplaintCategory | null;

  const [step, setStep] = useState<Step>("details");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ComplaintCategory | "">(() => {
    return categoryParam &&
      CATEGORY_OPTIONS.some((c) => c.value === categoryParam)
      ? categoryParam
      : "";
  });
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);

  const [referenceId, setReferenceId] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [duplicateCandidates, setDuplicateCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [upvotingId, setUpvotingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState("");

  useEffect(() => {
    if (
      categoryParam &&
      CATEGORY_OPTIONS.some((c) => c.value === categoryParam)
    ) {
      setCategory(categoryParam);
    }
  }, [categoryParam]);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validateDetails() {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your report a short title.";
    if (!category) next.category = "Choose the category that best fits.";
    if (description.trim().length < 15)
      next.description = "Add a bit more detail (at least 15 characters).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateLocation() {
    const next: Record<string, string> = {};

    if (!address.trim()) {
      next.address = "Enter the address of the issue.";
    }

    if (!selectedLocation) {
      next.location = "Select the incident location on the map.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (submitting || checkingDuplicates) return;

    if (!selectedLocation || !category) {
      setSubmitError("Select a category and complaint location.");
      return;
    }

    if (!title.trim() || !description.trim() || !address.trim()) {
      setSubmitError("Please complete all required complaint fields.");
      return;
    }

    setCheckingDuplicates(true);
    setSubmitError("");
    setDuplicateError("");

    try {
      const result = await api.checkDuplicates({
        description: description.trim(),
        category,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });

      if (result.hasPossibleDuplicates && result.candidates.length > 0) {
        setDuplicateCandidates(result.candidates);
        setStep("duplicates");
        return;
      }

      await registerComplaint();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to check for duplicate complaints.",
      );
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function registerComplaint() {
    if (!selectedLocation || !category) {
      setSubmitError("Select a category and complaint location.");
      setStep("location");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await api.createComplaint({
        title: title.trim(),
        description: description.trim(),
        category,
        address: address.trim(),
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });

      setReferenceId(result.data.referenceId);
      setStep("submitted");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to submit your complaint. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(candidate: DuplicateCandidate) {
    if (upvotingId) return;

    setUpvotingId(candidate.complaintId);
    setDuplicateError("");

    try {
      await api.upvoteComplaint(candidate.complaintId);
      navigate("/complaints");
    } catch (error) {
      setDuplicateError(
        error instanceof Error
          ? error.message
          : "Unable to upvote this complaint. Please try again.",
      );
    } finally {
      setUpvotingId(null);
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "location", label: "Location" },
    { key: "review", label: "Review" },
  ];

  if (step === "submitted") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 glass-panel px-6 py-14 text-center shadow-ios-glass">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          <CheckCircle size={44} weight="fill" />
        </div>
        <h1 className="text-2xl font-extrabold text-ink">Report submitted</h1>
        <p className="text-sm text-ink-soft">
          Your complaint has been logged and assigned reference{" "}
          <span className="font-mono font-bold text-primary">
            #{referenceId}
          </span>
          . You'll get updates as it progresses.
        </p>
        <div className="mt-3 flex gap-3">
          <button
            onClick={() => navigate("/complaints")}
            className="ios-btn-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md cursor-pointer"
          >
            Track this complaint
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-xl border border-white/70 bg-white/60 px-5 py-2.5 text-sm font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white/90"
          >
            Back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
          New Report
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
          Report an Issue
        </h1>
        <p className="text-sm font-medium text-ink-soft">
          Takes about two minutes.
        </p>
      </div>

      {/* Step indicator — iOS Progress Pills */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {steps.map((s, i) => {
          const isActive = s.key === step;
          const isDone = steps.findIndex((x) => x.key === step) > i;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all ${
                  isDone
                    ? "bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
                    : isActive
                      ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)]"
                      : "border border-white/70 bg-white/60 text-ink-soft backdrop-blur-md"
                }`}
              >
                {isDone ? <CheckCircle size={16} weight="bold" /> : i + 1}
              </span>
              <span
                className={`text-xs font-bold ${isActive ? "text-blue-700" : "text-ink-soft"}`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="mx-1 h-[2px] flex-1 bg-white/60" />
              )}
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <form
          className="flex flex-col gap-5 glass-panel p-6 sm:p-7 shadow-ios-glass"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateDetails()) setStep("location");
          }}
          noValidate
        >
          <Field label="Title" htmlFor="title" error={errors.title}>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Large pothole near bus stop"
              className={inputClass(!!errors.title)}
            />
          </Field>

          <Field label="Category" htmlFor="category" error={errors.category}>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className={inputClass(!!errors.category)}
            >
              <option value="">Select a category</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            helper="What's wrong, and how long has it been like this?"
          >
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass(!!errors.description)}
            />
          </Field>

          <Field label="Photos (optional)" htmlFor="evidence">
            <label
              htmlFor="evidence"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/70 bg-white/40 py-6 text-center backdrop-blur-sm transition-all hover:bg-white/60 hover:border-blue-400"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <UploadSimple size={22} weight="bold" />
              </div>
              <span className="text-xs font-semibold text-ink-soft">
                Tap to add photos as evidence
              </span>
              <input
                id="evidence"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur-md"
                  >
                    {f.name}
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <button
            type="submit"
            className="ios-btn-primary mt-2 py-3 text-sm font-semibold text-white shadow-md cursor-pointer"
          >
            Continue to Location
          </button>
        </form>
      )}

      {step === "location" && (
        <form
          className="flex flex-col gap-5 glass-panel p-6 sm:p-7 shadow-ios-glass"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateLocation()) setStep("review");
          }}
          noValidate
        >
          <LocationPicker
            value={selectedLocation}
            onChange={(location) => {
              setSelectedLocation(location);

              setErrors((previous) => {
                const next = { ...previous };
                delete next.location;
                return next;
              });
            }}
          />

          {errors.location && (
            <p className="text-xs font-semibold text-rose-600">
              {errors.location}
            </p>
          )}

          {selectedLocation && (
            <div className="rounded-xl border border-white/70 bg-white/50 p-3 text-xs text-ink-soft">
              <p className="font-semibold text-ink">Selected coordinates</p>
              <p>Latitude: {selectedLocation.latitude.toFixed(6)}</p>
              <p>Longitude: {selectedLocation.longitude.toFixed(6)}</p>
            </div>
          )}

          <Field label="Address" htmlFor="address" error={errors.address}>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, landmark, or area"
              className={inputClass(!!errors.address)}
            />
          </Field>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("details")}
              className="flex-1 rounded-xl border border-white/70 bg-white/60 py-3 text-sm font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white/90"
            >
              Back
            </button>
            <button
              type="submit"
              className="ios-btn-primary flex-1 py-3 text-sm font-semibold text-white shadow-md cursor-pointer"
            >
              Review
            </button>
          </div>
        </form>
      )}

      {step === "review" && (
        <form
          className="flex flex-col gap-5 glass-panel p-6 sm:p-7 shadow-ios-glass"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/40 p-5 backdrop-blur-sm shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]">
            <SummaryRow label="Title" value={title} />
            <SummaryRow
              label="Category"
              value={
                CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? "—"
              }
            />
            <SummaryRow label="Description" value={description} />
            <SummaryRow label="Address" value={address} />
            <SummaryRow
              label="Photos"
              value={files.length ? `${files.length} attached` : "None"}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3.5 py-2.5 text-xs text-ink-soft backdrop-blur-md">
            <Warning
              size={16}
              weight="fill"
              className="mt-0.5 shrink-0 text-primary"
            />
            Submitting a false or misleading report may result in your account
            being restricted.
          </div>

          {submitError && (
            <p
              role="alert"
              className="rounded-xl bg-rose-500/10 p-3 text-sm font-medium text-rose-700"
            >
              {submitError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("location")}
              className="flex-1 rounded-xl border border-white/70 bg-white/60 py-3 text-sm font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white/90"
            >
              Back
            </button>

            <button
              type="submit"
              disabled={submitting || checkingDuplicates}
              className="ios-btn-primary flex-1 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60 cursor-pointer"
            >
              {checkingDuplicates
                ? "Checking for duplicates..."
                : submitting
                  ? "Submitting..."
                  : "Check & Submit Report"}
            </button>
          </div>
        </form>
      )}

      {step === "duplicates" && (
        <div className="glass-panel flex flex-col gap-5 p-6 sm:p-7 shadow-ios-glass">
          <div>
            <h2 className="text-xl font-bold text-ink">
              Similar complaints already exist
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Check whether one of these reports describes the same issue. You
              can support an existing complaint or continue with a new report.
            </p>
          </div>

          {duplicateError && (
            <p
              role="alert"
              className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700"
            >
              {duplicateError}
            </p>
          )}

          <div className="flex flex-col gap-3">
            {duplicateCandidates.map((candidate) => (
              <article
                key={candidate.complaintId}
                className="rounded-2xl border border-white/70 bg-white/50 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-soft">
                    {candidate.category}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {Math.round(candidate.similarity * 100)}% text similarity
                  </span>
                </div>

                <p className="text-sm font-semibold text-ink">
                  {candidate.description}
                </p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span>Status: {candidate.status.replace(/_/g, " ")}</span>
                  {candidate.distanceMeters != null && (
                    <span>{Math.round(candidate.distanceMeters)} m away</span>
                  )}
                  <span>{candidate.upvoteCount} upvotes</span>
                </div>

                <button
                  type="button"
                  disabled={upvotingId !== null}
                  onClick={() => void handleUpvote(candidate)}
                  className="ios-btn-primary mt-4 w-full py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {upvotingId === candidate.complaintId
                    ? "Upvoting..."
                    : "Upvote this complaint"}
                </button>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/50 pt-4 sm:flex-row">
            <button
              type="button"
              onClick={() => setStep("review")}
              className="flex-1 rounded-xl border border-white/70 bg-white/60 py-3 text-sm font-semibold text-ink"
            >
              Back to review
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void registerComplaint()}
              className="ios-btn-primary flex-1 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit as new complaint"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  helper,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-ink">
        {label}
      </label>
      {children}
      {helper && !error && (
        <span className="text-[11px] text-ink-soft">{helper}</span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
          <Warning size={13} weight="fill" /> {error}
        </span>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/50 pb-2.5 last:border-0 last:pb-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft/80">
        {label}
      </span>
      <span className="text-sm font-medium text-ink">{value || "—"}</span>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `glass-input w-full px-3.5 py-2.5 text-sm ${
    hasError ? "!border-rose-500 !ring-2 !ring-rose-400/30" : ""
  }`;
}

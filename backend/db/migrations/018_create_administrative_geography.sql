
BEGIN;

-- Administrative identities are independent of their geographic boundaries.
CREATE TABLE administrative_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    unit_type VARCHAR(30) NOT NULL,
    parent_id UUID REFERENCES administrative_units(id) ON DELETE RESTRICT,
    authority VARCHAR(150) NOT NULL,
    external_code VARCHAR(80),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT administrative_units_type_check
        CHECK (unit_type IN ('MUNICIPALITY', 'ZONE', 'WARD'))
);

CREATE INDEX idx_administrative_units_parent
    ON administrative_units(parent_id);

CREATE INDEX idx_administrative_units_type
    ON administrative_units(unit_type);

-- Each import represents one immutable source dataset/version.
CREATE TABLE geography_source_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_key VARCHAR(100) NOT NULL,
    version_label VARCHAR(100) NOT NULL,
    source_authority VARCHAR(150) NOT NULL,
    source_name VARCHAR(200) NOT NULL,
    source_url TEXT,
    licence VARCHAR(200),
    source_checksum VARCHAR(64) NOT NULL,
    import_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT geography_source_imports_status_check
        CHECK (import_status IN ('PENDING', 'VALIDATED', 'IMPORTED', 'FAILED')),

    CONSTRAINT geography_source_imports_dataset_version_unique
        UNIQUE (dataset_key, version_label)
);

CREATE INDEX idx_geography_source_imports_status
    ON geography_source_imports(import_status);

-- A unit can have multiple boundary versions over time.
CREATE TABLE administrative_boundary_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    administrative_unit_id UUID NOT NULL
        REFERENCES administrative_units(id) ON DELETE RESTRICT,
    source_import_id UUID NOT NULL
        REFERENCES geography_source_imports(id) ON DELETE RESTRICT,
    boundary geometry(MultiPolygon, 4326) NOT NULL,
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT administrative_boundary_versions_dates_check
        CHECK (
            effective_to IS NULL
            OR effective_from IS NULL
            OR effective_to >= effective_from
        ),

    CONSTRAINT administrative_boundary_versions_unit_import_unique
        UNIQUE (administrative_unit_id, source_import_id)
);

CREATE INDEX idx_administrative_boundary_versions_geometry
    ON administrative_boundary_versions
    USING GIST (boundary);

CREATE INDEX idx_administrative_boundary_versions_unit
    ON administrative_boundary_versions(administrative_unit_id);

-- Attach resolved administrative identities to complaints.
ALTER TABLE complaints
    ADD COLUMN administrative_ward_id UUID
        REFERENCES administrative_units(id) ON DELETE SET NULL,
    ADD COLUMN administrative_zone_id UUID
        REFERENCES administrative_units(id) ON DELETE SET NULL,
    ADD COLUMN administrative_boundary_version_id UUID
        REFERENCES administrative_boundary_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_complaints_administrative_ward
    ON complaints(administrative_ward_id);

CREATE INDEX idx_complaints_administrative_zone
    ON complaints(administrative_zone_id);

-- Attach resolved administrative identities to infrastructure assets.
ALTER TABLE infrastructure_assets
    ADD COLUMN administrative_ward_id UUID
        REFERENCES administrative_units(id) ON DELETE SET NULL,
    ADD COLUMN administrative_zone_id UUID
        REFERENCES administrative_units(id) ON DELETE SET NULL,
    ADD COLUMN administrative_boundary_version_id UUID
        REFERENCES administrative_boundary_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_infrastructure_assets_administrative_ward
    ON infrastructure_assets(administrative_ward_id);

CREATE INDEX idx_infrastructure_assets_administrative_zone
    ON infrastructure_assets(administrative_zone_id);

COMMIT;

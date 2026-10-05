"! Reads plan facts and writes them through the RAP business object ZR_SAC_FACT, so locking, etags and the
"! common save sequence apply. Callers outside the fact BO use local_mode = abap_false; the fact BO's own
"! action handlers use local_mode = abap_true.
CLASS zcl_sac_fact_writer DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_fact,
             model_id   TYPE zsac_fact-model_id,
             version_id TYPE zsac_fact-version_id,
             period     TYPE zsac_fact-period,
             measure    TYPE zsac_fact-measure,
             dim1       TYPE zsac_fact-dim1,
             dim2       TYPE zsac_fact-dim2,
             dim3       TYPE zsac_fact-dim3,
             dim4       TYPE zsac_fact-dim4,
             dim5       TYPE zsac_fact-dim5,
             fact_value TYPE zsac_fact-fact_value,
           END OF ty_fact,
           ty_facts TYPE STANDARD TABLE OF ty_fact WITH DEFAULT KEY,
           ty_work  TYPE HASHED TABLE OF ty_fact WITH UNIQUE KEY model_id version_id period measure dim1 dim2 dim3 dim4 dim5.

    CLASS-METHODS read_model
      IMPORTING model_id      TYPE zsac_fact-model_id
      RETURNING VALUE(result) TYPE ty_facts.

    CLASS-METHODS read_version
      IMPORTING model_id      TYPE zsac_fact-model_id
                version_id    TYPE zsac_fact-version_id
      RETURNING VALUE(result) TYPE ty_facts.

    "! One tab separated line per fact: model, version, period, measure, dim1..dim5, value
    CLASS-METHODS parse_payload
      IMPORTING payload       TYPE string
      RETURNING VALUE(result) TYPE ty_facts.

    "! Create or update, decided against what is stored now
    CLASS-METHODS upsert
      IMPORTING facts      TYPE ty_facts
                local_mode TYPE abap_bool DEFAULT abap_false.

    CLASS-METHODS remove
      IMPORTING facts      TYPE ty_facts
                local_mode TYPE abap_bool DEFAULT abap_false.

    "! Makes the version hold exactly new_facts: creates, updates and deletes what differs
    CLASS-METHODS replace
      IMPORTING model_id   TYPE zsac_fact-model_id
                version_id TYPE zsac_fact-version_id
                new_facts  TYPE ty_facts
                local_mode TYPE abap_bool DEFAULT abap_false.

    "! Writes a change set whose `existing` side the caller already read
    CLASS-METHODS apply
      IMPORTING upserts    TYPE ty_facts
                deletes    TYPE ty_facts
                existing   TYPE ty_work
                local_mode TYPE abap_bool DEFAULT abap_false.
ENDCLASS.


CLASS zcl_sac_fact_writer IMPLEMENTATION.

  METHOD read_model.
    SELECT model_id, version_id, period, measure, dim1, dim2, dim3, dim4, dim5, fact_value
      FROM zsac_fact
      WHERE model_id = @model_id
      INTO TABLE @result.
  ENDMETHOD.


  METHOD read_version.
    SELECT model_id, version_id, period, measure, dim1, dim2, dim3, dim4, dim5, fact_value
      FROM zsac_fact
      WHERE model_id = @model_id AND version_id = @version_id
      INTO TABLE @result.
  ENDMETHOD.


  METHOD parse_payload.
    DATA lines TYPE string_table.
    SPLIT payload AT cl_abap_char_utilities=>newline INTO TABLE lines.
    LOOP AT lines INTO DATA(line).
      CHECK line IS NOT INITIAL.
      SPLIT line AT cl_abap_char_utilities=>horizontal_tab INTO TABLE DATA(cells).
      CHECK lines( cells ) >= 10.
      TRY.
          APPEND VALUE #( model_id   = cells[ 1 ]  version_id = cells[ 2 ]  period = cells[ 3 ]  measure = cells[ 4 ]
                          dim1       = cells[ 5 ]  dim2       = cells[ 6 ]  dim3   = cells[ 7 ]  dim4    = cells[ 8 ]
                          dim5       = cells[ 9 ]  fact_value = CONV decfloat34( cells[ 10 ] ) ) TO result.
        CATCH cx_sy_conversion_error cx_sy_itab_line_not_found.
          CONTINUE.
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.


  METHOD upsert.
    CHECK facts IS NOT INITIAL.
    DATA(keys) = facts.
    SELECT model_id, version_id, period, measure, dim1, dim2, dim3, dim4, dim5, fact_value
      FROM zsac_fact
      FOR ALL ENTRIES IN @keys
      WHERE model_id = @keys-model_id AND version_id = @keys-version_id
      INTO TABLE @DATA(stored).
    DATA existing TYPE ty_work.
    INSERT LINES OF stored INTO TABLE existing.
    apply( upserts = facts deletes = VALUE #( ) existing = existing local_mode = local_mode ).
  ENDMETHOD.


  METHOD remove.
    CHECK facts IS NOT INITIAL.
    apply( upserts = VALUE #( ) deletes = facts existing = VALUE #( ) local_mode = local_mode ).
  ENDMETHOD.


  METHOD replace.
    DATA current TYPE ty_work.
    DATA fresh   TYPE ty_work.
    DATA gone    TYPE ty_facts.

    INSERT LINES OF read_version( model_id = model_id version_id = version_id ) INTO TABLE current.
    LOOP AT new_facts INTO DATA(f).
      f-model_id   = model_id.
      f-version_id = version_id.
      INSERT f INTO TABLE fresh.
      IF sy-subrc <> 0.
        MODIFY TABLE fresh FROM f.
      ENDIF.
    ENDLOOP.
    LOOP AT current INTO DATA(c).
      IF NOT line_exists( fresh[ model_id = c-model_id version_id = c-version_id period = c-period measure = c-measure
                                 dim1 = c-dim1 dim2 = c-dim2 dim3 = c-dim3 dim4 = c-dim4 dim5 = c-dim5 ] ).
        APPEND c TO gone.
      ENDIF.
    ENDLOOP.
    apply( upserts = VALUE #( FOR u IN fresh ( u ) ) deletes = gone existing = current local_mode = local_mode ).
  ENDMETHOD.


  METHOD apply.
    DATA creates TYPE TABLE FOR CREATE zr_sac_fact\\Fact.
    DATA updates TYPE TABLE FOR UPDATE zr_sac_fact\\Fact.
    DATA removes TYPE TABLE FOR DELETE zr_sac_fact\\Fact.
    DATA done    TYPE ty_work.

    LOOP AT upserts INTO DATA(u).
      INSERT u INTO TABLE done.
      IF sy-subrc <> 0.
        CONTINUE.   " the same key twice in one batch: the first one wins
      ENDIF.
      IF line_exists( existing[ model_id = u-model_id version_id = u-version_id period = u-period measure = u-measure
                                dim1 = u-dim1 dim2 = u-dim2 dim3 = u-dim3 dim4 = u-dim4 dim5 = u-dim5 ] ).
        APPEND VALUE #( ModelId = u-model_id VersionId = u-version_id Period = u-period Measure = u-measure
                        Dim1 = u-dim1 Dim2 = u-dim2 Dim3 = u-dim3 Dim4 = u-dim4 Dim5 = u-dim5
                        Value = u-fact_value ) TO updates.
      ELSE.
        APPEND VALUE #( %cid = |F{ lines( creates ) + 1 }|
                        ModelId = u-model_id VersionId = u-version_id Period = u-period Measure = u-measure
                        Dim1 = u-dim1 Dim2 = u-dim2 Dim3 = u-dim3 Dim4 = u-dim4 Dim5 = u-dim5
                        Value = u-fact_value ) TO creates.
      ENDIF.
    ENDLOOP.

    LOOP AT deletes INTO DATA(d).
      APPEND VALUE #( ModelId = d-model_id VersionId = d-version_id Period = d-period Measure = d-measure
                      Dim1 = d-dim1 Dim2 = d-dim2 Dim3 = d-dim3 Dim4 = d-dim4 Dim5 = d-dim5 ) TO removes.
    ENDLOOP.

    CHECK creates IS NOT INITIAL OR updates IS NOT INITIAL OR removes IS NOT INITIAL.

    IF local_mode = abap_true.
      MODIFY ENTITIES OF zr_sac_fact IN LOCAL MODE
        ENTITY Fact
          CREATE SET FIELDS WITH creates
          UPDATE FIELDS ( Value ) WITH updates
          DELETE FROM removes
        FAILED DATA(failed_local)
        REPORTED DATA(reported_local).
    ELSE.
      MODIFY ENTITIES OF zr_sac_fact
        ENTITY Fact
          CREATE SET FIELDS WITH creates
          UPDATE FIELDS ( Value ) WITH updates
          DELETE FROM removes
        FAILED DATA(failed_global)
        REPORTED DATA(reported_global).
    ENDIF.
  ENDMETHOD.

ENDCLASS.

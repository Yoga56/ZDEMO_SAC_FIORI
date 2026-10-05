"! Data action engine (the ABAP twin of DataActionEngine.js; both follow the same semantics).
"!   COPY      facts of SRC_VERSION matching the filter -> TGT_VERSION, value * factor
"!   SCALE     facts of TGT_VERSION matching the filter -> value * factor
"!   DELETE    facts of TGT_VERSION matching the filter are removed
"!   ALLOCATE  the sum of SRC_VERSION facts matching the filter is spread equally over TARGET_MEMBERS of TARGET_DIM
"! filter_text is the data filter parameter: it narrows the filter of every step.
CLASS zcl_sac_dataact_engine DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             changed TYPE i,
             status  TYPE c LENGTH 1,   " S success, E error
             log     TYPE string_table,
           END OF ty_result.

    CLASS-METHODS run
      IMPORTING action_id     TYPE zsac_dataact-action_id
                filter_text   TYPE string OPTIONAL
      RETURNING VALUE(result) TYPE ty_result.
ENDCLASS.


CLASS zcl_sac_dataact_engine IMPLEMENTATION.

  METHOD run.
    SELECT SINGLE model_id FROM zsac_dataact WHERE action_id = @action_id INTO @DATA(model_id).
    IF sy-subrc <> 0.
      result-status = 'E'.
      APPEND |Data action { action_id } does not exist| TO result-log.
      RETURN.
    ENDIF.

    SELECT step_no, step_type, src_version, tgt_version, filter_text, factor, target_dim, target_members
      FROM zsac_dastep WHERE action_id = @action_id ORDER BY step_no INTO TABLE @DATA(steps).
    SELECT version_id FROM zsac_version WHERE model_id = @model_id AND locked = @abap_true INTO TABLE @DATA(locked).

    LOOP AT steps INTO DATA(step) WHERE tgt_version IS NOT INITIAL.
      IF line_exists( locked[ version_id = step-tgt_version ] ).
        result-status = 'E'.
        APPEND |Version { step-tgt_version } is locked| TO result-log.
        RETURN.
      ENDIF.
    ENDLOOP.

    DATA before TYPE zcl_sac_fact_writer=>ty_work.
    DATA work   TYPE zcl_sac_fact_writer=>ty_work.
    INSERT LINES OF zcl_sac_fact_writer=>read_model( model_id ) INTO TABLE before.
    work = before.

    DATA(param_filter) = zcl_sac_filter=>parse( model_id = model_id text = filter_text ).

    LOOP AT steps INTO step.
      DATA(filter) = zcl_sac_filter=>merge( first  = zcl_sac_filter=>parse( model_id = model_id text = step-filter_text )
                                            second = param_filter ).
      DATA(factor) = COND decfloat34( WHEN step-factor IS INITIAL THEN 1 ELSE step-factor ).
      DATA(touched) = 0.
      DATA(snapshot) = work.

      CASE step-step_type.
        WHEN 'COPY'.
          LOOP AT snapshot INTO DATA(src) WHERE version_id = step-src_version.
            CHECK zcl_sac_filter=>matches( fact = src filter = filter ) = abap_true.
            DATA(copy) = src.
            copy-version_id = step-tgt_version.
            copy-fact_value = round( val = src-fact_value * factor dec = 2 ).
            INSERT copy INTO TABLE work.
            IF sy-subrc <> 0.
              MODIFY TABLE work FROM copy.
            ENDIF.
            touched = touched + 1.
          ENDLOOP.

        WHEN 'SCALE'.
          LOOP AT work ASSIGNING FIELD-SYMBOL(<scale>) WHERE version_id = step-tgt_version.
            CHECK zcl_sac_filter=>matches( fact = <scale> filter = filter ) = abap_true.
            <scale>-fact_value = round( val = <scale>-fact_value * factor dec = 2 ).
            touched = touched + 1.
          ENDLOOP.

        WHEN 'DELETE'.
          LOOP AT snapshot INTO DATA(gone) WHERE version_id = step-tgt_version.
            CHECK zcl_sac_filter=>matches( fact = gone filter = filter ) = abap_true.
            DELETE TABLE work FROM gone.
            touched = touched + 1.
          ENDLOOP.

        WHEN 'ALLOCATE'.
          DATA members TYPE string_table.
          CLEAR members.
          SPLIT step-target_members AT ',' INTO TABLE members.
          DELETE members WHERE table_line IS INITIAL.
          SELECT SINGLE slot FROM zsac_dim WHERE model_id = @model_id AND dim_id = @step-target_dim INTO @DATA(slot).
          IF sy-subrc <> 0 OR members IS INITIAL.
            APPEND |Step { step-step_no }: choose the dimension and members to allocate over| TO result-log.
            CONTINUE.
          ENDIF.
          DATA(field) = |DIM{ slot }|.
          TYPES: BEGIN OF ty_group,
                   sample TYPE zcl_sac_fact_writer=>ty_fact,
                   sum    TYPE decfloat34,
                 END OF ty_group.
          DATA groups TYPE STANDARD TABLE OF ty_group WITH DEFAULT KEY.
          CLEAR groups.
          LOOP AT snapshot INTO DATA(source) WHERE version_id = step-src_version.
            CHECK zcl_sac_filter=>matches( fact = source filter = filter ) = abap_true.
            DATA(key) = source.
            ASSIGN COMPONENT field OF STRUCTURE key TO FIELD-SYMBOL(<target_field>).
            CLEAR <target_field>.
            key-fact_value = 0.
            ASSIGN groups[ sample-period = key-period sample-measure = key-measure sample-dim1 = key-dim1 sample-dim2 = key-dim2
                           sample-dim3 = key-dim3 sample-dim4 = key-dim4 sample-dim5 = key-dim5 ] TO FIELD-SYMBOL(<group>).
            IF sy-subrc <> 0.
              APPEND VALUE #( sample = key ) TO groups ASSIGNING <group>.
            ENDIF.
            <group>-sum = <group>-sum + source-fact_value.
          ENDLOOP.
          LOOP AT groups INTO DATA(g).
            LOOP AT members INTO DATA(member).
              DATA(allocated) = g-sample.
              allocated-version_id = step-tgt_version.
              ASSIGN COMPONENT field OF STRUCTURE allocated TO FIELD-SYMBOL(<member_field>).
              <member_field> = member.
              allocated-fact_value = round( val = g-sum / lines( members ) dec = 2 ).
              INSERT allocated INTO TABLE work.
              IF sy-subrc <> 0.
                MODIFY TABLE work FROM allocated.
              ENDIF.
              touched = touched + 1.
            ENDLOOP.
          ENDLOOP.

        WHEN OTHERS.
          APPEND |Step { step-step_no }: unknown type { step-step_type }| TO result-log.
          CONTINUE.
      ENDCASE.

      result-changed = result-changed + touched.
      APPEND |Step { step-step_no } { step-step_type }: { touched } values| TO result-log.
    ENDLOOP.

    " write only what moved
    DATA upserts TYPE zcl_sac_fact_writer=>ty_facts.
    DATA deletes TYPE zcl_sac_fact_writer=>ty_facts.
    LOOP AT work INTO DATA(now).
      READ TABLE before INTO DATA(old) WITH TABLE KEY model_id = now-model_id version_id = now-version_id period = now-period
           measure = now-measure dim1 = now-dim1 dim2 = now-dim2 dim3 = now-dim3 dim4 = now-dim4 dim5 = now-dim5.
      IF sy-subrc <> 0 OR old-fact_value <> now-fact_value.
        APPEND now TO upserts.
      ENDIF.
    ENDLOOP.
    LOOP AT before INTO old.
      IF NOT line_exists( work[ model_id = old-model_id version_id = old-version_id period = old-period measure = old-measure
                                dim1 = old-dim1 dim2 = old-dim2 dim3 = old-dim3 dim4 = old-dim4 dim5 = old-dim5 ] ).
        APPEND old TO deletes.
      ENDIF.
    ENDLOOP.
    zcl_sac_fact_writer=>apply( upserts = upserts deletes = deletes existing = before ).
    result-status = 'S'.
  ENDMETHOD.

ENDCLASS.

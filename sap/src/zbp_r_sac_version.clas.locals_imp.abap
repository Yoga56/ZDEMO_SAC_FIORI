CLASS lhc_version DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR version RESULT result.

    METHODS createprivate FOR MODIFY
      IMPORTING keys FOR ACTION version~CreatePrivate RESULT result.

    METHODS publish FOR MODIFY
      IMPORTING keys FOR ACTION version~Publish RESULT result.

    METHODS revert FOR MODIFY
      IMPORTING keys FOR ACTION version~Revert RESULT result.

    METHODS deletefacts FOR DETERMINE ON MODIFY
      IMPORTING keys FOR version~DeleteFacts.
ENDCLASS.

CLASS lhc_version IMPLEMENTATION.

  METHOD get_global_authorizations.
  ENDMETHOD.


  " a private version is a copy of an existing one, owned by the user
  METHOD createprivate.
    LOOP AT keys INTO DATA(key).
      DATA(model_id) = CONV zsac_version-model_id( key-%param-ModelId ).
      DATA(source)   = CONV zsac_version-version_id( key-%param-SourceVersion ).
      SELECT SINGLE @abap_true FROM zsac_version
        WHERE model_id = @model_id AND version_id = @source INTO @DATA(exists).
      IF sy-subrc <> 0.
        APPEND VALUE #( %cid = key-%cid ) TO failed-version.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Version { source } does not exist| ) ) TO reported-version.
        CONTINUE.
      ENDIF.

      DATA(new_id) = zcl_sac_version_engine=>next_private_id( model_id ).
      MODIFY ENTITIES OF zr_sac_version IN LOCAL MODE
        ENTITY version
          CREATE FIELDS ( ModelId VersionId VersionName Category Locked OwnerId SourceVersion Status )
          WITH VALUE #( ( %cid = 'PRIVATE' ModelId = model_id VersionId = new_id
                                            VersionName = COND #( WHEN key-%param-VersionName IS NOT INITIAL THEN key-%param-VersionName ELSE new_id )
                                            Category = 'PRIVATE' Locked = abap_false OwnerId = sy-uname
                                            SourceVersion = source Status = 'D' ) )
        MAPPED DATA(created)
        FAILED DATA(create_failed).
      IF create_failed IS NOT INITIAL OR created-version IS INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-version.
        CONTINUE.
      ENDIF.

      zcl_sac_version_engine=>copy_version( model_id = model_id from_version = source to_version = new_id ).

      READ ENTITIES OF zr_sac_version IN LOCAL MODE
        ENTITY version ALL FIELDS WITH VALUE #( ( %tky = created-version[ 1 ]-%tky ) )
        RESULT DATA(versions).
      APPEND VALUE #( %cid = key-%cid %param = versions[ 1 ] ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD publish.
    READ ENTITIES OF zr_sac_version IN LOCAL MODE
      ENTITY version FIELDS ( ModelId VersionId ) WITH CORRESPONDING #( keys )
      RESULT DATA(versions).

    LOOP AT versions INTO DATA(version).
      DATA(param) = keys[ %tky = version-%tky ]-%param.
      DATA(outcome) = zcl_sac_version_engine=>publish( model_id = version-ModelId
                                                       source   = version-VersionId
                                                       target   = CONV #( param-TargetVersion ) ).
      IF outcome-ok = abap_false.
        APPEND VALUE #( %tky = version-%tky ) TO failed-version.
        APPEND VALUE #( %tky = version-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = outcome-message ) ) TO reported-version.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( %tky = version-%tky %param = VALUE #( Published = outcome-count ) ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD revert.
    READ ENTITIES OF zr_sac_version IN LOCAL MODE
      ENTITY version ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(versions).

    LOOP AT versions INTO DATA(version).
      DATA(outcome) = zcl_sac_version_engine=>revert( model_id = version-ModelId version = version-VersionId ).
      IF outcome-ok = abap_false.
        APPEND VALUE #( %tky = version-%tky ) TO failed-version.
        APPEND VALUE #( %tky = version-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = outcome-message ) ) TO reported-version.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( %tky = version-%tky %param = version ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " deleting a version deletes its numbers
  METHOD deletefacts.
    LOOP AT keys INTO DATA(key).
      zcl_sac_fact_writer=>replace( model_id = key-ModelId version_id = key-VersionId new_facts = VALUE #( ) ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
